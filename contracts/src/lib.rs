//! Nebula agent-trust registries for Casper (Odra / Rust → Wasm).
//!
//! ERC-8004-style Identity Registry: an agent gets a transferable on-chain
//! identity (id ≥ 1) whose card URI points at the agent card (name, endpoints,
//! operational key, skills). Other agents resolve identity → card, then layer
//! reputation/validation on top.
//!
//! Owners and operational addresses are `Address` (an account or contract `Key`);
//! storage uses `Mapping`s; events use the Casper Event Standard (CES); upgrades
//! use contract package versioning.

use odra::prelude::*;
use odra::prelude::Address;

pub mod reputation;
pub mod validation;
pub use reputation::ReputationRegistry;
pub use validation::ValidationRegistry;

#[odra::odra_error]
pub enum Error {
    ZeroIsReserved = 1,
    AgentAddressAlreadyRegistered = 2,
    NotAuthorized = 3,
    UnknownAgent = 4,
}

#[odra::event]
pub struct AgentRegistered {
    pub agent_id: u64,
    pub owner: Address,
    pub agent_address: Address,
    pub card_uri: String,
}

#[odra::event]
pub struct AgentCardUpdated {
    pub agent_id: u64,
    pub card_uri: String,
}

#[odra::event]
pub struct AgentAddressUpdated {
    pub agent_id: u64,
    pub agent_address: Address,
}

#[odra::event]
pub struct IdentityTransfer {
    pub from: Option<Address>,
    pub to: Address,
    pub agent_id: u64,
}

/// ERC-8004-style Identity Registry. Agent ids are monotonic and start at 1
/// (0 is the "none" sentinel).
#[odra::module(
    events = [AgentRegistered, AgentCardUpdated, AgentAddressUpdated, IdentityTransfer],
    errors = Error
)]
pub struct IdentityRegistry {
    total_agents: Var<u64>,
    owners: Mapping<u64, Option<Address>>,
    agent_addresses: Mapping<u64, Option<Address>>,
    card_uris: Mapping<u64, String>,
    /// reverse lookup: operational address → agent id (0 = none).
    agent_id_by_address: Mapping<Address, u64>,
}

#[odra::module]
impl IdentityRegistry {
    pub fn init(&mut self) {
        self.total_agents.set(0);
    }

    /// Register a new agent identity owned by the caller, binding the agent's
    /// operational address + card URI. Returns the new agent id.
    pub fn register(&mut self, card_uri: String, agent_address: Address) -> u64 {
        if self.agent_id_by_address.get_or_default(&agent_address) != 0 {
            self.env().revert(Error::AgentAddressAlreadyRegistered);
        }
        let owner = self.env().caller();
        let agent_id = self.total_agents.get_or_default() + 1;
        self.total_agents.set(agent_id);
        self.owners.set(&agent_id, Some(owner));
        self.agent_addresses.set(&agent_id, Some(agent_address));
        self.card_uris.set(&agent_id, card_uri.clone());
        self.agent_id_by_address.set(&agent_address, agent_id);
        self.env().emit_event(IdentityTransfer { from: None, to: owner, agent_id });
        self.env().emit_event(AgentRegistered { agent_id, owner, agent_address, card_uri });
        agent_id
    }

    /// Resolve an agent id to (owner, operational address, card URI).
    pub fn resolve(&self, agent_id: u64) -> (Address, Address, String) {
        let owner = self.owner_of(agent_id);
        let agent_address = self
            .agent_addresses
            .get(&agent_id)
            .flatten()
            .unwrap_or_revert_with(&self.env(), Error::UnknownAgent);
        (owner, agent_address, self.card_uris.get_or_default(&agent_id))
    }

    /// Update the agent card URI. Owner only.
    pub fn set_agent_card(&mut self, agent_id: u64, card_uri: String) {
        self.assert_owner(agent_id);
        self.card_uris.set(&agent_id, card_uri.clone());
        self.env().emit_event(AgentCardUpdated { agent_id, card_uri });
    }

    /// Rotate the agent's operational address. Owner only.
    pub fn set_agent_address(&mut self, agent_id: u64, agent_address: Address) {
        self.assert_owner(agent_id);
        if self.agent_id_by_address.get_or_default(&agent_address) != 0 {
            self.env().revert(Error::AgentAddressAlreadyRegistered);
        }
        if let Some(prev) = self.agent_addresses.get(&agent_id).flatten() {
            self.agent_id_by_address.set(&prev, 0);
        }
        self.agent_addresses.set(&agent_id, Some(agent_address));
        self.agent_id_by_address.set(&agent_address, agent_id);
        self.env().emit_event(AgentAddressUpdated { agent_id, agent_address });
    }

    /// Transfer identity ownership to a new owner. Owner only.
    pub fn transfer(&mut self, agent_id: u64, to: Address) {
        let owner = self.assert_owner(agent_id);
        self.owners.set(&agent_id, Some(to));
        self.env().emit_event(IdentityTransfer { from: Some(owner), to, agent_id });
    }

    pub fn owner_of(&self, agent_id: u64) -> Address {
        self.owners
            .get(&agent_id)
            .flatten()
            .unwrap_or_revert_with(&self.env(), Error::UnknownAgent)
    }

    pub fn agent_id_of(&self, agent_address: Address) -> u64 {
        self.agent_id_by_address.get_or_default(&agent_address)
    }

    pub fn total_agents(&self) -> u64 {
        self.total_agents.get_or_default()
    }

    fn assert_owner(&self, agent_id: u64) -> Address {
        let owner = self.owner_of(agent_id);
        if owner != self.env().caller() {
            self.env().revert(Error::NotAuthorized);
        }
        owner
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, NoArgs};

    #[test]
    fn register_and_resolve() {
        let env = odra_test::env();
        let mut reg = IdentityRegistry::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let agent_addr = env.get_account(1);

        env.set_caller(owner);
        let id = reg.register("ipfs://card".to_string(), agent_addr);
        assert_eq!(id, 1);
        assert_eq!(reg.total_agents(), 1);

        let (o, a, uri) = reg.resolve(id);
        assert_eq!(o, owner);
        assert_eq!(a, agent_addr);
        assert_eq!(uri, "ipfs://card".to_string());
        assert_eq!(reg.agent_id_of(agent_addr), 1);
    }

    #[test]
    fn duplicate_agent_address_reverts() {
        let env = odra_test::env();
        let mut reg = IdentityRegistry::deploy(&env, NoArgs);
        let agent_addr = env.get_account(1);
        env.set_caller(env.get_account(0));
        reg.register("uri".to_string(), agent_addr);
        assert_eq!(
            reg.try_register("uri2".to_string(), agent_addr).unwrap_err(),
            Error::AgentAddressAlreadyRegistered.into()
        );
    }

    #[test]
    fn only_owner_updates_card() {
        let env = odra_test::env();
        let mut reg = IdentityRegistry::deploy(&env, NoArgs);
        let owner = env.get_account(0);
        let stranger = env.get_account(2);
        env.set_caller(owner);
        let id = reg.register("uri".to_string(), env.get_account(1));

        env.set_caller(stranger);
        assert_eq!(
            reg.try_set_agent_card(id, "hacked".to_string()).unwrap_err(),
            Error::NotAuthorized.into()
        );
    }
}
