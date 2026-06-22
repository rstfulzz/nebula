//! Constant-product AMM pool (x*y=k) with a 0.3% swap fee — the pool engine
//! behind a swap venue. Tracks the two reserves and LP shares; `get_amount_out`
//! is the standard 997/1000 fee formula. Token custody (pulling/pushing CEP-18
//! tokens on add-liquidity and swap) wires on top of this engine.

use odra::casper_types::U256;
use odra::prelude::*;
use odra::prelude::Address;

#[odra::odra_error]
pub enum AmmError {
    ZeroAmount = 31,
    InsufficientLiquidity = 32,
    InsufficientOutput = 33,
}

#[odra::event]
pub struct LiquidityAdded {
    pub provider: Address,
    pub amount_a: U256,
    pub amount_b: U256,
    pub lp_minted: U256,
}

#[odra::event]
pub struct Swapped {
    pub trader: Address,
    pub a_to_b: bool,
    pub amount_in: U256,
    pub amount_out: U256,
}

#[odra::module(events = [LiquidityAdded, Swapped], errors = AmmError)]
pub struct Amm {
    reserve_a: Var<U256>,
    reserve_b: Var<U256>,
    total_lp: Var<U256>,
    lp: Mapping<Address, U256>,
}

#[odra::module]
impl Amm {
    pub fn init(&mut self) {
        self.reserve_a.set(U256::zero());
        self.reserve_b.set(U256::zero());
        self.total_lp.set(U256::zero());
    }

    /// Provide liquidity. LP shares are proportional to the share of reserve A
    /// (the first provider sets the price). Returns the LP shares minted.
    pub fn add_liquidity(&mut self, amount_a: U256, amount_b: U256) -> U256 {
        if amount_a.is_zero() || amount_b.is_zero() {
            self.env().revert(AmmError::ZeroAmount);
        }
        let ra = self.reserve_a.get_or_default();
        let rb = self.reserve_b.get_or_default();
        let total = self.total_lp.get_or_default();
        let minted = if total.is_zero() { amount_a } else { amount_a * total / ra };

        self.reserve_a.set(ra + amount_a);
        self.reserve_b.set(rb + amount_b);
        self.total_lp.set(total + minted);
        let provider = self.env().caller();
        self.lp.set(&provider, self.lp.get_or_default(&provider) + minted);
        self.env().emit_event(LiquidityAdded { provider, amount_a, amount_b, lp_minted: minted });
        minted
    }

    /// Swap A→B; reverts if the output is below `min_out`. Returns the output.
    pub fn swap_a_for_b(&mut self, amount_in: U256, min_out: U256) -> U256 {
        let ra = self.reserve_a.get_or_default();
        let rb = self.reserve_b.get_or_default();
        let out = self.get_amount_out(amount_in, ra, rb);
        if out < min_out {
            self.env().revert(AmmError::InsufficientOutput);
        }
        self.reserve_a.set(ra + amount_in);
        self.reserve_b.set(rb - out);
        self.env().emit_event(Swapped {
            trader: self.env().caller(),
            a_to_b: true,
            amount_in,
            amount_out: out,
        });
        out
    }

    /// Swap B→A; reverts if the output is below `min_out`. Returns the output.
    pub fn swap_b_for_a(&mut self, amount_in: U256, min_out: U256) -> U256 {
        let ra = self.reserve_a.get_or_default();
        let rb = self.reserve_b.get_or_default();
        let out = self.get_amount_out(amount_in, rb, ra);
        if out < min_out {
            self.env().revert(AmmError::InsufficientOutput);
        }
        self.reserve_b.set(rb + amount_in);
        self.reserve_a.set(ra - out);
        self.env().emit_event(Swapped {
            trader: self.env().caller(),
            a_to_b: false,
            amount_in,
            amount_out: out,
        });
        out
    }

    pub fn quote_a_for_b(&self, amount_in: U256) -> U256 {
        self.get_amount_out(amount_in, self.reserve_a.get_or_default(), self.reserve_b.get_or_default())
    }

    pub fn quote_b_for_a(&self, amount_in: U256) -> U256 {
        self.get_amount_out(amount_in, self.reserve_b.get_or_default(), self.reserve_a.get_or_default())
    }

    pub fn reserves(&self) -> (U256, U256) {
        (self.reserve_a.get_or_default(), self.reserve_b.get_or_default())
    }

    pub fn lp_balance(&self, who: Address) -> U256 {
        self.lp.get_or_default(&who)
    }

    /// Standard constant-product output with a 0.3% fee: out =
    /// (in*997*reserve_out) / (reserve_in*1000 + in*997).
    fn get_amount_out(&self, amount_in: U256, reserve_in: U256, reserve_out: U256) -> U256 {
        if amount_in.is_zero() {
            self.env().revert(AmmError::ZeroAmount);
        }
        if reserve_in.is_zero() || reserve_out.is_zero() {
            self.env().revert(AmmError::InsufficientLiquidity);
        }
        let amount_in_with_fee = amount_in * U256::from(997);
        let numerator = amount_in_with_fee * reserve_out;
        let denominator = reserve_in * U256::from(1000) + amount_in_with_fee;
        numerator / denominator
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, NoArgs};

    fn u(n: u64) -> U256 {
        U256::from(n)
    }

    #[test]
    fn add_liquidity_then_swap() {
        let env = odra_test::env();
        let mut amm = Amm::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));

        let minted = amm.add_liquidity(u(1_000_000), u(1_000_000));
        assert_eq!(minted, u(1_000_000));
        assert_eq!(amm.reserves(), (u(1_000_000), u(1_000_000)));

        let quoted = amm.quote_a_for_b(u(1000));
        // 0.3% fee + slippage => out is just under 1000
        assert!(quoted > u(0) && quoted < u(1000));

        let out = amm.swap_a_for_b(u(1000), u(1));
        assert_eq!(out, quoted);
        let (ra, rb) = amm.reserves();
        assert_eq!(ra, u(1_001_000));
        assert_eq!(rb, u(1_000_000) - out);
    }

    #[test]
    fn swap_below_min_out_reverts() {
        let env = odra_test::env();
        let mut amm = Amm::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));
        amm.add_liquidity(u(1_000_000), u(1_000_000));
        assert_eq!(
            amm.try_swap_a_for_b(u(1000), u(1_000_000)).unwrap_err(),
            AmmError::InsufficientOutput.into()
        );
    }

    #[test]
    fn swap_on_empty_pool_reverts() {
        let env = odra_test::env();
        let mut amm = Amm::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));
        assert_eq!(
            amm.try_swap_a_for_b(u(1000), u(0)).unwrap_err(),
            AmmError::InsufficientLiquidity.into()
        );
    }
}
