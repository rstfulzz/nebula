//! `PayExchange` — converts **CSPRPAY** (our CEP-3009 `PayToken`) into native
//! **CSPR**, closing Nebula's self-funding loop: the agent earns CSPRPAY from
//! x402 micropayments, redeems it here for CSPR, then stakes that CSPR to
//! compound. The exchange is a thin, owner-seeded liquidity pot: CSPR is seeded
//! into the contract's main purse, and `redeem` pulls CSPRPAY in (via the
//! payer's off-chain EIP-712 authorization) and pushes CSPR out 1:1.
//!
//! ## Why CEP-3009 (not a plain transfer)
//!
//! The redeeming agent never sends a transaction. It signs an off-chain
//! `transfer_with_authorization` for its CSPRPAY exactly as it would for any
//! x402 payment, and the exchange (or a facilitator) submits it. The exchange
//! cross-contract-calls `PayToken::transfer_with_authorization` with
//! `to = self.env().self_address()`, so the CSPRPAY lands in the exchange and
//! the auth's own validity-window / nonce / signature checks are enforced by
//! `PayToken` — an invalid auth reverts the whole `redeem`.
//!
//! ## Native-CSPR custody
//!
//! CSPR custody uses Odra's native-token API, mirroring `treasury.rs`: `seed`
//! is `#[odra(payable)]` (the attached motes land in the contract purse), the
//! purse balance is read with `self.env().self_balance()` (U512), and `redeem`
//! pushes motes out with `self.env().transfer_tokens(...)`. Both CSPRPAY and
//! CSPR are 9-decimal, so at the default 1:1 rate motes map directly and the
//! `U256`↔`U512` conversion is a lossless zero-extend.
//!
//! ## Cross-contract call form
//!
//! `PayToken` lives in this same crate, so Odra generates a typed
//! `PayTokenContractRef`. We build one with
//! `PayTokenContractRef::new(self.env(), pay_token_addr)` (its `new` takes the
//! `Rc<ContractEnv>` that `self.env()` already returns) and call
//! `.transfer_with_authorization(..)` on it — a compile-time-checked call, no
//! hand-rolled `RuntimeArgs`. Under the hood Odra lowers this to
//! `env.call_contract(addr, CallDef::new("transfer_with_authorization", true, args))`.

use crate::cep3009::PayTokenContractRef;
use odra::casper_types::bytesrepr::Bytes;
use odra::casper_types::crypto::PublicKey;
use odra::casper_types::{U256, U512};
use odra::prelude::Address;
use odra::prelude::*;
use odra::ContractRef;

#[odra::odra_error]
pub enum PayExchangeError {
    /// The contract's CSPR purse holds less than the `cspr_out` owed.
    InsufficientLiquidity = 61,
}

/// Emitted when CSPR liquidity is added to the exchange purse via `seed`.
#[odra::event]
pub struct Seeded {
    pub amount: U256,
}

/// Emitted when a redemption settles: `pay_in` CSPRPAY pulled from `from`,
/// `cspr_out` motes paid back to `from`.
#[odra::event]
pub struct Redeemed {
    pub from: Address,
    pub pay_in: U256,
    pub cspr_out: U256,
}

#[odra::module(events = [Seeded, Redeemed], errors = PayExchangeError)]
pub struct PayExchange {
    /// Package address of the CSPRPAY `PayToken` this exchange redeems.
    pay_token: Var<Address>,
    /// CSPR-out per CSPRPAY-in, as a fraction `rate_num / rate_den`. Default 1:1.
    rate_num: Var<U256>,
    rate_den: Var<U256>,
    /// Running total of CSPRPAY redeemed, for stats.
    redeemed_total: Var<U256>,
}

#[odra::module]
impl PayExchange {
    /// Install the exchange against a specific `PayToken` package, at a 1:1
    /// CSPRPAY→CSPR rate (both assets are 9-decimal, so motes map directly).
    pub fn init(&mut self, pay_token: Address) {
        self.pay_token.set(pay_token);
        self.rate_num.set(U256::one());
        self.rate_den.set(U256::one());
        self.redeemed_total.set(U256::zero());
    }

    /// Add native CSPR liquidity to the exchange. Payable: the attached motes
    /// are moved into this contract's main purse by Odra; we only read the
    /// amount to emit `Seeded`.
    #[odra(payable)]
    pub fn seed(&mut self) {
        let amount = u512_to_u256(self.env().attached_value());
        self.env().emit_event(Seeded { amount });
    }

    /// Redeem `amount` CSPRPAY from `from` for native CSPR, paid back to `from`.
    ///
    /// Steps:
    /// 1. Pull `amount` CSPRPAY from `from` into this contract by cross-contract
    ///    calling `PayToken::transfer_with_authorization` with
    ///    `to = self.env().self_address()` and the forwarded off-chain auth. If
    ///    the auth is invalid (window / nonce / signature), `PayToken` reverts
    ///    and that propagates out of `redeem`.
    /// 2. Compute `cspr_out = amount * rate_num / rate_den`.
    /// 3. Revert `InsufficientLiquidity` if the CSPR purse can't cover it.
    /// 4. Push `cspr_out` motes from the purse to `from`.
    /// 5. Emit `Redeemed`.
    ///
    /// The auth arg names/types mirror `PayToken::transfer_with_authorization`.
    #[allow(clippy::too_many_arguments)]
    pub fn redeem(
        &mut self,
        from: Address,
        amount: U256,
        valid_after: u64,
        valid_before: u64,
        nonce: Bytes,
        public_key: PublicKey,
        signature: Bytes,
    ) {
        let pay_token = self.pay_token.get_or_revert_with(PayExchangeError::InsufficientLiquidity);
        let self_address = self.env().self_address();

        // 1. Pull the CSPRPAY into this contract. Typed, compile-time-checked
        //    cross-contract call on the same-crate `PayToken`. Reverts (and
        //    propagates) if the authorization is invalid.
        let mut pay = PayTokenContractRef::new(self.env(), pay_token);
        pay.transfer_with_authorization(
            from,
            self_address,
            amount,
            valid_after,
            valid_before,
            nonce,
            public_key,
            signature,
        );

        // 2. CSPR owed at the configured rate.
        let cspr_out = amount * self.rate_num.get_or_default() / self.rate_den.get_or_default();

        // 3. Liquidity check against the contract's CSPR purse.
        if u512_to_u256(self.env().self_balance()) < cspr_out {
            self.env().revert(PayExchangeError::InsufficientLiquidity);
        }

        // 4. Pay native CSPR back to the redeemer.
        self.env().transfer_tokens(&from, &u256_to_u512(cspr_out));

        // 5. Stats + event.
        self.redeemed_total.set(self.redeemed_total.get_or_default() + amount);
        self.env().emit_event(Redeemed { from, pay_in: amount, cspr_out });
    }

    // --- Views ---------------------------------------------------------------

    /// Native CSPR (in motes, as `U256`) currently available to pay redemptions.
    pub fn cspr_reserve(&self) -> U256 {
        u512_to_u256(self.env().self_balance())
    }

    /// The `PayToken` package this exchange redeems.
    pub fn pay_token(&self) -> Address {
        self.pay_token.get_or_revert_with(PayExchangeError::InsufficientLiquidity)
    }

    /// The redemption rate as `(num, den)`: `cspr_out = pay_in * num / den`.
    pub fn rate(&self) -> (U256, U256) {
        (self.rate_num.get_or_default(), self.rate_den.get_or_default())
    }

    /// Total CSPRPAY redeemed over the exchange's lifetime.
    pub fn redeemed_total(&self) -> U256 {
        self.redeemed_total.get_or_default()
    }
}

/// Widen a `U256` to `U512` at the native-token boundary. CSPR amounts fit in
/// `U256`, so this is a lossless zero-extend.
fn u256_to_u512(value: U256) -> U512 {
    let mut bytes = [0u8; 32];
    value.to_little_endian(&mut bytes);
    U512::from_little_endian(&bytes)
}

/// Narrow a `U512` (an attached value / purse balance) to `U256`. Exchange
/// amounts are well within `U256`, so the high bytes are zero — lossless.
fn u512_to_u256(value: U512) -> U256 {
    let mut bytes = [0u8; 64];
    value.to_little_endian(&mut bytes);
    U256::from_little_endian(&bytes[..32])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cep3009::{PayToken, PayTokenError, PayTokenHostRef};
    use odra::casper_types::bytesrepr::ToBytes;
    use odra::casper_types::crypto::{sign, SecretKey};
    use odra::host::{Deployer, HostRef, NoArgs};

    fn u(n: u64) -> U256 {
        U256::from(n)
    }

    fn u512(n: u64) -> U512 {
        U512::from(n)
    }

    /// A deterministic ed25519 keypair whose account-hash `Address` we fund.
    /// Distinct from the 0..N test-VM genesis keys (which use `[i; 32]` seeds).
    fn payer_keypair() -> (SecretKey, PublicKey, Address) {
        let secret = SecretKey::ed25519_from_bytes([7u8; 32]).unwrap();
        let public = PublicKey::from(&secret);
        let address = Address::from(public.clone());
        (secret, public, address)
    }

    fn nonce32(seed: u8) -> Bytes {
        Bytes::from(vec![seed; 32])
    }

    /// Deploy `PayToken` + `PayExchange` in one env, fund the payer with CSPRPAY,
    /// and seed the exchange with `seed_cspr` motes of CSPR liquidity.
    fn setup(
        seed_cspr: u64,
        payer_pay_balance: u64,
    ) -> (
        odra::host::HostEnv,
        PayTokenHostRef,
        PayExchangeHostRef,
        SecretKey,
        PublicKey,
        Address,
    ) {
        let env = odra_test::env();
        let deployer = env.get_account(0);

        env.set_caller(deployer);
        let mut token = PayToken::deploy(&env, NoArgs);
        let exchange = PayExchange::deploy(&env, PayExchangeInitArgs { pay_token: token.address() });

        let (secret, public, payer) = payer_keypair();
        // Fund the payer with CSPRPAY from the deployer's supply.
        token.transfer(payer, u(payer_pay_balance));

        // Seed CSPR liquidity into the exchange purse.
        if seed_cspr > 0 {
            exchange.with_tokens(u512(seed_cspr)).seed();
        }

        (env, token, exchange, secret, public, payer)
    }

    /// Build a valid `transfer_with_authorization` for `from -> to` over the
    /// `PayToken` digest, signed by `secret/public`. Mirrors cep3009.rs's tests.
    #[allow(clippy::too_many_arguments)]
    fn signed_auth(
        token: &PayTokenHostRef,
        secret: &SecretKey,
        public: &PublicKey,
        from: Address,
        to: Address,
        amount: U256,
        valid_after: u64,
        valid_before: u64,
        nonce: &Bytes,
    ) -> Bytes {
        let digest = token.transfer_with_authorization_digest(
            from,
            to,
            amount,
            valid_after,
            valid_before,
            nonce,
        );
        Bytes::from(sign(digest, secret, public).to_bytes().unwrap())
    }

    #[test]
    fn init_sets_state() {
        let (_env, token, exchange, _s, _p, _payer) = setup(0, 1_000);
        assert_eq!(exchange.pay_token(), token.address());
        assert_eq!(exchange.rate(), (u(1), u(1)));
        assert_eq!(exchange.redeemed_total(), u(0));
    }

    #[test]
    fn seed_credits_cspr_reserve() {
        let (_env, _token, exchange, _s, _p, _payer) = setup(5_000, 1_000);
        // The whole seed landed in the contract purse.
        assert_eq!(exchange.cspr_reserve(), u(5_000));
    }

    #[test]
    fn redeem_swaps_csprpay_for_cspr() {
        let (env, token, mut exchange, secret, public, payer) = setup(10_000, 1_000);
        let exchange_addr = exchange.address();

        let amount = u(250);
        let valid_after = 0u64;
        let valid_before = 10_000_000_000u64; // far future
        let nonce = nonce32(1);
        let sig = signed_auth(
            &token, &secret, &public, payer, exchange_addr, amount, valid_after, valid_before, &nonce,
        );

        // Balances before.
        assert_eq!(token.balance_of(payer), u(1_000));
        assert_eq!(token.balance_of(exchange_addr), u(0));
        let payer_cspr_before = env.balance_of(&payer);
        let reserve_before = exchange.cspr_reserve();

        exchange.redeem(payer, amount, valid_after, valid_before, nonce, public, sig);

        // CSPRPAY moved payer -> exchange.
        assert_eq!(token.balance_of(payer), u(750));
        assert_eq!(token.balance_of(exchange_addr), u(250));
        // CSPR moved exchange -> payer, 1:1.
        assert_eq!(env.balance_of(&payer), payer_cspr_before + u512(250));
        assert_eq!(exchange.cspr_reserve(), reserve_before - u(250));
        // Stats updated.
        assert_eq!(exchange.redeemed_total(), u(250));
    }

    #[test]
    fn redeem_emits_redeemed_event() {
        let (env, token, mut exchange, secret, public, payer) = setup(10_000, 1_000);
        let exchange_addr = exchange.address();

        let amount = u(100);
        let nonce = nonce32(2);
        let sig = signed_auth(
            &token, &secret, &public, payer, exchange_addr, amount, 0, 10_000_000_000, &nonce,
        );
        exchange.redeem(payer, amount, 0, 10_000_000_000, nonce, public, sig);

        let event: Redeemed = env.get_event(&exchange, -1).unwrap();
        assert_eq!(event.from, payer);
        assert_eq!(event.pay_in, u(100));
        assert_eq!(event.cspr_out, u(100));
    }

    #[test]
    fn redeem_reverts_on_insufficient_liquidity() {
        // Seed only 100 motes but try to redeem 250 CSPRPAY (=> 250 motes owed).
        let (_env, token, mut exchange, secret, public, payer) = setup(100, 1_000);
        let exchange_addr = exchange.address();

        let amount = u(250);
        let nonce = nonce32(3);
        let sig = signed_auth(
            &token, &secret, &public, payer, exchange_addr, amount, 0, 10_000_000_000, &nonce,
        );

        assert_eq!(
            exchange
                .try_redeem(payer, amount, 0, 10_000_000_000, nonce, public, sig)
                .unwrap_err(),
            PayExchangeError::InsufficientLiquidity.into()
        );
        // No CSPRPAY was pulled either: the call as a whole reverted... but note
        // the PayToken pull happens BEFORE the liquidity check, so on revert the
        // whole transaction (including the pull) is rolled back.
        assert_eq!(token.balance_of(payer), u(1_000));
        assert_eq!(token.balance_of(exchange_addr), u(0));
    }

    #[test]
    fn redeem_reverts_on_invalid_auth() {
        // Sign a DIFFERENT amount than submitted -> PayToken digest mismatch.
        let (_env, token, mut exchange, secret, public, payer) = setup(10_000, 1_000);
        let exchange_addr = exchange.address();

        let amount = u(100);
        let nonce = nonce32(4);
        // Auth signed over 999, but we submit 100.
        let bad_sig = signed_auth(
            &token, &secret, &public, payer, exchange_addr, u(999), 0, 10_000_000_000, &nonce,
        );

        assert_eq!(
            exchange
                .try_redeem(payer, amount, 0, 10_000_000_000, nonce, public, bad_sig)
                .unwrap_err(),
            PayTokenError::InvalidSignature.into()
        );
        // Nothing moved.
        assert_eq!(token.balance_of(payer), u(1_000));
        assert_eq!(exchange.cspr_reserve(), u(10_000));
    }

    #[test]
    fn redeem_reverts_on_reused_nonce() {
        let (_env, token, mut exchange, secret, public, payer) = setup(10_000, 1_000);
        let exchange_addr = exchange.address();

        let amount = u(100);
        let nonce = nonce32(5);
        let sig = signed_auth(
            &token, &secret, &public, payer, exchange_addr, amount, 0, 10_000_000_000, &nonce,
        );
        // First redeem succeeds.
        exchange.redeem(payer, amount, 0, 10_000_000_000, nonce.clone(), public.clone(), sig.clone());

        // Replaying the same (from, nonce) must revert (propagated from PayToken).
        assert_eq!(
            exchange
                .try_redeem(payer, amount, 0, 10_000_000_000, nonce, public, sig)
                .unwrap_err(),
            PayTokenError::NonceUsed.into()
        );
        assert_eq!(token.balance_of(exchange_addr), u(100));
    }
}
