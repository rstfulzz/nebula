//! Deposit CSPR into the already-deployed `Treasury` contract via the Odra
//! livenet env. Loads the existing contract package (does NOT deploy), attaches
//! 50 CSPR, and calls the payable `deposit` entry point — crediting the caller's
//! scoped budget.
//!
//! The caller (`ODRA_CASPER_LIVENET_SECRET_KEY_PATH`) must already be registered
//! on the contract (`register`), otherwise `deposit` reverts `NotRegistered`.
//!
//! Env (see ../.env): ODRA_CASPER_LIVENET_SECRET_KEY_PATH, _NODE_ADDRESS,
//! _CHAIN_NAME (casper-test), _EVENTS_URL.
//!
//! Run: cargo run --bin deposit --features livenet

use core::str::FromStr;

use nebula_casper_contracts::Treasury;
use odra::casper_types::U512;
use odra::host::{HostRef, HostRefLoader};
use odra::prelude::{Address, Addressable};

/// Deployed `Treasury` contract package (Casper Testnet).
const TREASURY_PACKAGE: &str =
    "hash-ca9367fd08fd8aa419bf3e3be11edb41068e08aa2904201d0caa459cb6e963a5";

/// 50 CSPR in motes (1 CSPR = 10^9 motes).
const DEPOSIT_MOTES: u64 = 50_000_000_000;

fn main() {
    let env = odra_casper_livenet_env::env();

    // `hash-<64-byte-hash>` parses to the `Contract` (package) variant.
    let address = Address::from_str(TREASURY_PACKAGE).expect("valid Treasury package address");

    // Load the existing contract package (HostRefLoader on the contract type).
    let treasury = Treasury::load(&env, address);
    println!("Treasury = {:?}", treasury.address());
    println!("Caller   = {:?}", env.caller());

    // 20 CSPR gas budget for the deposit call.
    env.set_gas(20_000_000_000);

    // Attach 50 CSPR and credit the caller's scoped budget.
    treasury.with_tokens(U512::from(DEPOSIT_MOTES)).deposit();

    println!("Deposited {} motes (50 CSPR) into Treasury budget.", DEPOSIT_MOTES);
}
