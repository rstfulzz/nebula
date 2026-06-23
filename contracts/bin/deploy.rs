//! Deploy the Nebula contracts to a live Casper network via the Odra livenet env.
//!
//! Env (see ../.env): ODRA_CASPER_LIVENET_SECRET_KEY_PATH, _NODE_ADDRESS,
//! _CHAIN_NAME (casper-test), _EVENTS_URL.
//!
//! Run: cargo run --bin deploy --features livenet

use nebula_casper_contracts::{Amm, IdentityRegistry, ReputationRegistry, ValidationRegistry};
use odra::host::{Deployer, NoArgs};
use odra::prelude::Addressable;

fn main() {
    let env = odra_casper_livenet_env::env();

    env.set_gas(250_000_000_000);
    let identity = IdentityRegistry::deploy(&env, NoArgs);
    println!("IdentityRegistry   = {:?}", identity.address());

    env.set_gas(250_000_000_000);
    let reputation = ReputationRegistry::deploy(&env, NoArgs);
    println!("ReputationRegistry = {:?}", reputation.address());

    env.set_gas(250_000_000_000);
    let validation = ValidationRegistry::deploy(&env, NoArgs);
    println!("ValidationRegistry = {:?}", validation.address());

    env.set_gas(300_000_000_000);
    let amm = Amm::deploy(&env, NoArgs);
    println!("Amm                = {:?}", amm.address());
}
