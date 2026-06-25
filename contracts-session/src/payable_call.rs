#![no_std]
#![no_main]
#![allow(internal_features)]
#![feature(core_intrinsics)]

//! Generic Casper session wasm: funds ANY `#[odra(payable)]` entry point on a
//! contract *package* via the cargo-purse pattern.
//!
//! Casper contracts can only receive CSPR through a "cargo purse" (a purse the
//! session creates, funds from its own main purse, and hands to the contract,
//! which then drains it). casper-js-sdk can't attach value to a plain contract
//! call, so we deploy this session, which does the create→fund→call dance for
//! the latest version of any package's payable entry point.
//!
//! Runtime args (from casper-js-sdk `SessionBuilder.runtimeArgs(...)`):
//!   - `amount`      : U512        — motes to attach (1 CSPR = 1e9 motes).
//!   - `contract`    : ByteArray(32) — the target *package* hash bytes (raw 32
//!                     bytes of `hash-…`), deserialized as `ContractPackageHash`.
//!   - `entry_point` : String      — the payable entry point to call, e.g.
//!                     "deposit" (Treasury) or "seed" (PayExchange).
//!
//! Flow (mirrors Odra's `handle_attached_value`):
//!   1. create a fresh purse,
//!   2. transfer `amount` from this session account's main purse into it,
//!   3. call the package's latest version of `entry_point` with
//!      `cargo_purse = <URef>`.
//! The contract then pulls the funds out of the cargo purse.

extern crate alloc;

use alloc::string::String;

// Global allocator for the wasm32 target (casper-contract's built-in wee_alloc
// is disabled via default-features = false). Mirrors odra-casper-wasm-env.
#[allow(unused_imports)]
use ink_allocator;

use casper_contract::contract_api::{account, runtime, system};
use casper_contract::unwrap_or_revert::UnwrapOrRevert;
use casper_types::contracts::ContractPackageHash;
use casper_types::{runtime_args, U512};

/// Panic handler for the wasm32 target — aborts, like odra-casper-wasm-env.
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    core::intrinsics::abort();
}

#[no_mangle]
pub extern "C" fn call() {
    let amount: U512 = runtime::get_named_arg("amount");
    let contract: ContractPackageHash = runtime::get_named_arg("contract");
    let entry_point: String = runtime::get_named_arg("entry_point");

    // 1. Fresh cargo purse owned by this session account.
    let cargo_purse = system::create_purse();

    // 2. Move `amount` motes into the cargo purse.
    system::transfer_from_purse_to_purse(account::get_main_purse(), cargo_purse, amount, None)
        .unwrap_or_revert();

    // 3. Invoke the package's latest version of `entry_point` (None = latest),
    //    handing it the cargo purse. Odra's `handle_attached_value` drains it.
    let _: () = runtime::call_versioned_contract(
        contract,
        None,
        &entry_point,
        runtime_args! { "cargo_purse" => cargo_purse },
    );
}
