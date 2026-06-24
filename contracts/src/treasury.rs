//! Multi-tenant scoped treasury: the "one user, one wallet, one agent"
//! foundation. Each owner delegates a bounded CSPR budget to a single per-user
//! agent key. The agent may execute transfers, but only inside on-chain limits
//! (per-tx cap, rolling 24h daily cap, available balance). The owner keeps full
//! control: set limits, pause, and withdraw the budget at any time.
//!
//! Real CSPR custody uses Odra's native-token API — `deposit` is payable
//! (`self.env().attached_value()`), and `execute`/`withdraw` push motes out with
//! `self.env().transfer_tokens(...)`. The daily window rolls on
//! `self.env().get_block_time()` (ms). Per-owner state lives in parallel
//! `Mapping<Address, T>` fields; events use the Casper Event Standard (CES).

use odra::casper_types::{U256, U512};
use odra::prelude::Address;
use odra::prelude::*;

/// One rolling daily window in milliseconds (24h).
const DAY_MS: u64 = 86_400_000;

#[odra::odra_error]
pub enum TreasuryError {
    Unauthorized = 41,
    Paused = 42,
    ExceedsPerTxCap = 43,
    ExceedsDailyCap = 44,
    InsufficientBalance = 45,
    NotRegistered = 46,
}

#[odra::event]
pub struct Registered {
    pub owner: Address,
    pub agent_key: Address,
    pub per_tx_cap: U256,
    pub daily_cap: U256,
}

#[odra::event]
pub struct Deposited {
    pub owner: Address,
    pub amount: U256,
    pub balance: U256,
}

#[odra::event]
pub struct Executed {
    pub owner: Address,
    pub agent_key: Address,
    pub recipient: Address,
    pub amount: U256,
    pub spent_today: U256,
    pub balance: U256,
}

#[odra::event]
pub struct Withdrawn {
    pub owner: Address,
    pub amount: U256,
    pub balance: U256,
}

#[odra::event]
pub struct LimitsChanged {
    pub owner: Address,
    pub per_tx_cap: U256,
    pub daily_cap: U256,
}

#[odra::event]
pub struct PausedChanged {
    pub owner: Address,
    pub paused: bool,
}

/// Scoped treasury. Per-owner state is held in parallel `Mapping`s keyed by the
/// owner `Address` (a stored struct is awkward to mutate field-by-field in this
/// Odra version, so parallel maps are clearer and cheaper).
#[odra::module(
    events = [Registered, Deposited, Executed, Withdrawn, LimitsChanged, PausedChanged],
    errors = TreasuryError
)]
pub struct Treasury {
    registered: Mapping<Address, bool>,
    agent_key: Mapping<Address, Option<Address>>,
    balance: Mapping<Address, U256>,
    per_tx_cap: Mapping<Address, U256>,
    daily_cap: Mapping<Address, U256>,
    spent_today: Mapping<Address, U256>,
    day_start: Mapping<Address, u64>,
    paused: Mapping<Address, bool>,
}

#[odra::module]
impl Treasury {
    pub fn init(&mut self) {}

    /// Owner sets up (or re-configures) their scoped account: bind the agent key
    /// and the two spend caps. An existing `balance` is preserved; the daily
    /// window is reset (`spent_today = 0`, `day_start = now`).
    pub fn register(&mut self, agent_key: Address, per_tx_cap: U256, daily_cap: U256) {
        let owner = self.env().caller();
        self.registered.set(&owner, true);
        self.agent_key.set(&owner, Some(agent_key));
        self.per_tx_cap.set(&owner, per_tx_cap);
        self.daily_cap.set(&owner, daily_cap);
        self.spent_today.set(&owner, U256::zero());
        self.day_start.set(&owner, self.env().get_block_time());
        self.paused.set(&owner, false);
        self.env().emit_event(Registered { owner, agent_key, per_tx_cap, daily_cap });
    }

    /// Credit the caller's (owner's) delegated budget with the attached CSPR.
    /// Payable: the motes attached to the call are read via `attached_value()`
    /// and are now held by this contract's purse.
    #[odra(payable)]
    pub fn deposit(&mut self) {
        let owner = self.env().caller();
        self.assert_registered(owner);
        let amount = u512_to_u256(self.env().attached_value());
        let balance = self.balance.get_or_default(&owner) + amount;
        self.balance.set(&owner, balance);
        self.env().emit_event(Deposited { owner, amount, balance });
    }

    /// Agent-driven spend. The caller MUST be `owner`'s registered agent key.
    /// Enforces, in order: not paused, per-tx cap, rolling daily cap, available
    /// balance — then debits balance + daily spend and pushes CSPR to `recipient`.
    pub fn execute(&mut self, owner: Address, recipient: Address, amount: U256) {
        self.assert_registered(owner);

        // Authorization: only the owner's bound agent key may execute.
        let agent = self.agent_key.get(&owner).flatten();
        if agent != Some(self.env().caller()) {
            self.env().revert(TreasuryError::Unauthorized);
        }

        if self.paused.get_or_default(&owner) {
            self.env().revert(TreasuryError::Paused);
        }

        if amount > self.per_tx_cap.get_or_default(&owner) {
            self.env().revert(TreasuryError::ExceedsPerTxCap);
        }

        // Roll the daily window forward if the current one has elapsed.
        let now = self.env().get_block_time();
        let mut spent = self.spent_today.get_or_default(&owner);
        if now >= self.day_start.get_or_default(&owner) + DAY_MS {
            spent = U256::zero();
            self.day_start.set(&owner, now);
        }

        if spent + amount > self.daily_cap.get_or_default(&owner) {
            self.env().revert(TreasuryError::ExceedsDailyCap);
        }

        let balance = self.balance.get_or_default(&owner);
        if amount > balance {
            self.env().revert(TreasuryError::InsufficientBalance);
        }

        let new_balance = balance - amount;
        let new_spent = spent + amount;
        self.balance.set(&owner, new_balance);
        self.spent_today.set(&owner, new_spent);

        // Push the CSPR out of the contract purse to the recipient.
        self.env().transfer_tokens(&recipient, &u256_to_u512(amount));

        self.env().emit_event(Executed {
            owner,
            agent_key: self.env().caller(),
            recipient,
            amount,
            spent_today: new_spent,
            balance: new_balance,
        });
    }

    /// Owner-only: change the two spend caps. The daily window is left intact, so
    /// a tightened daily cap takes effect against the already-spent amount.
    pub fn set_limits(&mut self, per_tx_cap: U256, daily_cap: U256) {
        let owner = self.env().caller();
        self.assert_registered(owner);
        self.per_tx_cap.set(&owner, per_tx_cap);
        self.daily_cap.set(&owner, daily_cap);
        self.env().emit_event(LimitsChanged { owner, per_tx_cap, daily_cap });
    }

    /// Owner-only: freeze / unfreeze agent execution.
    pub fn pause(&mut self, paused: bool) {
        let owner = self.env().caller();
        self.assert_registered(owner);
        self.paused.set(&owner, paused);
        self.env().emit_event(PausedChanged { owner, paused });
    }

    /// Owner-only: pull CSPR back out of the delegated budget to the owner.
    pub fn withdraw(&mut self, amount: U256) {
        let owner = self.env().caller();
        self.assert_registered(owner);
        let balance = self.balance.get_or_default(&owner);
        if amount > balance {
            self.env().revert(TreasuryError::InsufficientBalance);
        }
        let new_balance = balance - amount;
        self.balance.set(&owner, new_balance);
        self.env().transfer_tokens(&owner, &u256_to_u512(amount));
        self.env().emit_event(Withdrawn { owner, amount, balance: new_balance });
    }

    // --- Views ---------------------------------------------------------------

    pub fn agent_key_of(&self, owner: Address) -> Address {
        self.agent_key
            .get(&owner)
            .flatten()
            .unwrap_or_revert_with(&self.env(), TreasuryError::NotRegistered)
    }

    pub fn balance_of(&self, owner: Address) -> U256 {
        self.balance.get_or_default(&owner)
    }

    pub fn limits_of(&self, owner: Address) -> (U256, U256) {
        (self.per_tx_cap.get_or_default(&owner), self.daily_cap.get_or_default(&owner))
    }

    pub fn spent_today_of(&self, owner: Address) -> U256 {
        self.spent_today.get_or_default(&owner)
    }

    pub fn is_paused(&self, owner: Address) -> bool {
        self.paused.get_or_default(&owner)
    }

    /// The most that the agent could spend in a single `execute` right now:
    /// `min(per_tx_cap, daily_cap - spent_today, balance)`. Note this is a pure
    /// view: it does NOT roll the daily window, so it reflects the current stored
    /// `spent_today` (a stale window only ever understates availability, never
    /// over-states it, so it stays safe).
    pub fn available_today(&self, owner: Address) -> U256 {
        let per_tx = self.per_tx_cap.get_or_default(&owner);
        let remaining = self
            .daily_cap
            .get_or_default(&owner)
            .saturating_sub(self.spent_today.get_or_default(&owner));
        let balance = self.balance.get_or_default(&owner);
        min(min(per_tx, remaining), balance)
    }

    // --- Internal ------------------------------------------------------------

    fn assert_registered(&self, owner: Address) {
        if !self.registered.get_or_default(&owner) {
            self.env().revert(TreasuryError::NotRegistered);
        }
    }
}

fn min(a: U256, b: U256) -> U256 {
    if a < b {
        a
    } else {
        b
    }
}

/// Widen a `U256` to `U512` (used at the native-token boundary). CSPR balances
/// fit comfortably in `U256`, so this is a lossless zero-extend.
fn u256_to_u512(value: U256) -> U512 {
    let mut bytes = [0u8; 32];
    value.to_little_endian(&mut bytes);
    U512::from_little_endian(&bytes)
}

/// Narrow a `U512` (an attached/transfer amount) to `U256`. Treasury budgets are
/// well within `U256`, so the high 32 bytes are zero and this is lossless.
fn u512_to_u256(value: U512) -> U256 {
    let mut bytes = [0u8; 64];
    value.to_little_endian(&mut bytes);
    U256::from_little_endian(&bytes[..32])
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostRef, NoArgs};

    fn u(n: u64) -> U256 {
        U256::from(n)
    }

    fn u512(n: u64) -> U512 {
        U512::from(n)
    }

    #[test]
    fn register_sets_state() {
        let env = odra_test::env();
        let mut t = Treasury::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent = env.get_account(1);

        env.set_caller(owner);
        t.register(agent, u(100), u(250));
        assert_eq!(t.agent_key_of(owner), agent);
        assert_eq!(t.limits_of(owner), (u(100), u(250)));
        assert_eq!(t.balance_of(owner), u(0));
        assert_eq!(t.spent_today_of(owner), u(0));
        assert!(!t.is_paused(owner));
    }

    #[test]
    fn deposit_credits_balance() {
        let env = odra_test::env();
        let mut t = Treasury::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent = env.get_account(1);

        env.set_caller(owner);
        t.register(agent, u(100), u(250));
        t.with_tokens(u512(1_000)).deposit();

        assert_eq!(t.balance_of(owner), u(1_000));
    }

    #[test]
    fn deposit_before_register_reverts() {
        let env = odra_test::env();
        let t = Treasury::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));
        assert_eq!(
            t.with_tokens(u512(10)).try_deposit().unwrap_err(),
            TreasuryError::NotRegistered.into()
        );
    }

    #[test]
    fn execute_within_caps_moves_funds() {
        let env = odra_test::env();
        let mut t = Treasury::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        let recipient = env.get_account(2);

        env.set_caller(owner);
        t.register(agent, u(100), u(250));
        t.with_tokens(u512(1_000)).deposit();

        let recipient_before = env.balance_of(&recipient);

        env.set_caller(agent);
        t.execute(owner, recipient, u(40));

        // Ledger debited / daily spend bumped.
        assert_eq!(t.balance_of(owner), u(960));
        assert_eq!(t.spent_today_of(owner), u(40));
        // Recipient actually received the CSPR from the contract purse.
        assert_eq!(env.balance_of(&recipient), recipient_before + u512(40));

        // A second spend accumulates in the same daily window.
        t.execute(owner, recipient, u(60));
        assert_eq!(t.balance_of(owner), u(900));
        assert_eq!(t.spent_today_of(owner), u(100));
    }

    #[test]
    fn execute_over_per_tx_cap_reverts() {
        let env = odra_test::env();
        let mut t = Treasury::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        let recipient = env.get_account(2);

        env.set_caller(owner);
        t.register(agent, u(100), u(250));
        t.with_tokens(u512(1_000)).deposit();

        env.set_caller(agent);
        assert_eq!(
            t.try_execute(owner, recipient, u(101)).unwrap_err(),
            TreasuryError::ExceedsPerTxCap.into()
        );
    }

    #[test]
    fn execute_over_daily_cap_reverts() {
        let env = odra_test::env();
        let mut t = Treasury::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        let recipient = env.get_account(2);

        env.set_caller(owner);
        t.register(agent, u(100), u(250)); // daily cap 250
        t.with_tokens(u512(1_000)).deposit();

        env.set_caller(agent);
        t.execute(owner, recipient, u(100));
        t.execute(owner, recipient, u(100)); // spent_today = 200
        // Third 100 would push to 300 > 250.
        assert_eq!(
            t.try_execute(owner, recipient, u(100)).unwrap_err(),
            TreasuryError::ExceedsDailyCap.into()
        );
        assert_eq!(t.spent_today_of(owner), u(200));
    }

    #[test]
    fn execute_over_balance_reverts() {
        let env = odra_test::env();
        let mut t = Treasury::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        let recipient = env.get_account(2);

        env.set_caller(owner);
        // Caps high enough that balance is the binding constraint.
        t.register(agent, u(1_000), u(10_000));
        t.with_tokens(u512(50)).deposit();

        env.set_caller(agent);
        assert_eq!(
            t.try_execute(owner, recipient, u(60)).unwrap_err(),
            TreasuryError::InsufficientBalance.into()
        );
    }

    #[test]
    fn execute_by_non_agent_reverts() {
        let env = odra_test::env();
        let mut t = Treasury::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        let recipient = env.get_account(2);
        let stranger = env.get_account(3);

        env.set_caller(owner);
        t.register(agent, u(100), u(250));
        t.with_tokens(u512(1_000)).deposit();

        // The owner is NOT the agent — even the owner can't call execute.
        env.set_caller(owner);
        assert_eq!(
            t.try_execute(owner, recipient, u(10)).unwrap_err(),
            TreasuryError::Unauthorized.into()
        );

        env.set_caller(stranger);
        assert_eq!(
            t.try_execute(owner, recipient, u(10)).unwrap_err(),
            TreasuryError::Unauthorized.into()
        );
    }

    #[test]
    fn pause_blocks_execute() {
        let env = odra_test::env();
        let mut t = Treasury::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        let recipient = env.get_account(2);

        env.set_caller(owner);
        t.register(agent, u(100), u(250));
        t.with_tokens(u512(1_000)).deposit();
        t.pause(true);
        assert!(t.is_paused(owner));

        env.set_caller(agent);
        assert_eq!(
            t.try_execute(owner, recipient, u(10)).unwrap_err(),
            TreasuryError::Paused.into()
        );

        // Owner unpauses → execute flows again.
        env.set_caller(owner);
        t.pause(false);
        env.set_caller(agent);
        t.execute(owner, recipient, u(10));
        assert_eq!(t.balance_of(owner), u(990));
    }

    #[test]
    fn withdraw_debits_and_pays_owner() {
        let env = odra_test::env();
        let mut t = Treasury::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent = env.get_account(1);

        env.set_caller(owner);
        t.register(agent, u(100), u(250));
        t.with_tokens(u512(1_000)).deposit();

        let owner_before = env.balance_of(&owner);
        t.withdraw(u(400));
        assert_eq!(t.balance_of(owner), u(600));
        assert_eq!(env.balance_of(&owner), owner_before + u512(400));

        // Over-withdraw reverts.
        assert_eq!(
            t.try_withdraw(u(601)).unwrap_err(),
            TreasuryError::InsufficientBalance.into()
        );
    }

    #[test]
    fn daily_window_resets_after_advancing_time() {
        let env = odra_test::env();
        let mut t = Treasury::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        let recipient = env.get_account(2);

        env.set_caller(owner);
        t.register(agent, u(100), u(250));
        t.with_tokens(u512(10_000)).deposit();

        env.set_caller(agent);
        t.execute(owner, recipient, u(100));
        t.execute(owner, recipient, u(100)); // spent_today = 200, near the 250 cap
        assert_eq!(t.spent_today_of(owner), u(200));
        assert_eq!(
            t.try_execute(owner, recipient, u(100)).unwrap_err(),
            TreasuryError::ExceedsDailyCap.into()
        );

        // Advance past the 24h window; the next execute rolls spent_today to 0.
        env.advance_block_time(DAY_MS + 1);
        t.execute(owner, recipient, u(100));
        assert_eq!(t.spent_today_of(owner), u(100));
    }

    #[test]
    fn available_today_reflects_min_constraint() {
        let env = odra_test::env();
        let mut t = Treasury::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        let recipient = env.get_account(2);

        env.set_caller(owner);
        t.register(agent, u(100), u(250));
        t.with_tokens(u512(1_000)).deposit();
        // per_tx 100 is the binding constraint initially.
        assert_eq!(t.available_today(owner), u(100));

        env.set_caller(agent);
        t.execute(owner, recipient, u(100)); // spent 100, remaining daily = 150
        // per_tx (100) is still the min vs remaining-daily (150) vs balance (900).
        assert_eq!(t.available_today(owner), u(100));

        t.execute(owner, recipient, u(100)); // spent 200, remaining daily = 50
        // Now remaining-daily (50) is the min.
        assert_eq!(t.available_today(owner), u(50));
    }
}
