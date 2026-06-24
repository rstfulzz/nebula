//! A minimal CEP-18-style fungible token. `init` mints the full supply to the
//! deployer (no constructor args, so it installs with the standard pipeline).
//! Holds the standard surface the agent needs: name / symbol / decimals,
//! `balance_of`, `total_supply`, and `transfer`.

use odra::casper_types::U256;
use odra::prelude::Address;
use odra::prelude::*;

#[odra::odra_error]
pub enum TokenError {
    InsufficientBalance = 1,
}

#[odra::event]
pub struct Transfer {
    pub from: Address,
    pub to: Address,
    pub amount: U256,
}

#[odra::module(events = [Transfer], errors = TokenError)]
pub struct Token {
    balances: Mapping<Address, U256>,
    total_supply: Var<U256>,
}

#[odra::module]
impl Token {
    /// Mint the full supply (1,000,000 tokens at 9 decimals) to the deployer.
    pub fn init(&mut self) {
        let supply = U256::from(1_000_000u64) * U256::from(1_000_000_000u64);
        self.total_supply.set(supply);
        self.balances.set(&self.env().caller(), supply);
    }

    pub fn name(&self) -> String {
        "Nebula Test Token".to_string()
    }

    pub fn symbol(&self) -> String {
        "NBL".to_string()
    }

    pub fn decimals(&self) -> u8 {
        9
    }

    pub fn total_supply(&self) -> U256 {
        self.total_supply.get_or_default()
    }

    pub fn balance_of(&self, owner: Address) -> U256 {
        self.balances.get_or_default(&owner)
    }

    /// Mint `amount` new tokens to `to` (open, for the test token).
    pub fn mint(&mut self, to: Address, amount: U256) {
        self.total_supply.set(self.total_supply.get_or_default() + amount);
        self.balances.set(&to, self.balances.get_or_default(&to) + amount);
        self.env().emit_event(Transfer { from: to, to, amount });
    }

    /// Transfer `amount` from the caller to `recipient`.
    pub fn transfer(&mut self, recipient: Address, amount: U256) {
        let from = self.env().caller();
        let from_balance = self.balances.get_or_default(&from);
        if from_balance < amount {
            self.env().revert(TokenError::InsufficientBalance);
        }
        self.balances.set(&from, from_balance - amount);
        self.balances.set(&recipient, self.balances.get_or_default(&recipient) + amount);
        self.env().emit_event(Transfer { from, to: recipient, amount });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, NoArgs};

    #[test]
    fn mint_and_transfer() {
        let env = odra_test::env();
        let mut token = Token::deploy(&env, NoArgs);
        let deployer = env.get_account(0);
        let other = env.get_account(1);

        let supply = U256::from(1_000_000u64) * U256::from(1_000_000_000u64);
        assert_eq!(token.total_supply(), supply);
        assert_eq!(token.balance_of(deployer), supply);

        env.set_caller(deployer);
        token.transfer(other, U256::from(500u64));
        assert_eq!(token.balance_of(other), U256::from(500u64));
        assert_eq!(token.balance_of(deployer), supply - U256::from(500u64));
    }

    #[test]
    fn transfer_over_balance_reverts() {
        let env = odra_test::env();
        let mut token = Token::deploy(&env, NoArgs);
        let other = env.get_account(1);
        env.set_caller(other);
        assert_eq!(
            token.try_transfer(env.get_account(0), U256::from(1u64)).unwrap_err(),
            TokenError::InsufficientBalance.into()
        );
    }
}
