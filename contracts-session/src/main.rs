#![no_std]
#![no_main]
#![allow(internal_features)]
#![feature(core_intrinsics)]

//! Casper session wasm: funds the Treasury contract's `#[odra(payable)] deposit()`
//! via the cargo-purse pattern.
//!
//! Runtime args (sent from casper-js-sdk `SessionBuilder.runtimeArgs(...)`):
//!   - `amount`   : U512  — motes to deposit (1 CSPR = 1e9 motes).
//!   - `treasury` : ByteArray(32) — the Treasury *package* hash bytes
//!                  (raw 32 bytes of `hash-ca9367fd…`), deserialized here as
//!                  `casper_types::ContractPackageHash` (CLType ByteArray(32)).
//!
//! Flow (mirrors Odra's `handle_attached_value`):
//!   1. create a fresh purse,
//!   2. transfer `amount` from this session account's main purse into it,
//!   3. call the package's latest `deposit` version with `cargo_purse = <URef>`.
//! The contract then pulls the funds out of the cargo purse and credits
//! `get_caller()` (this session's account) with `amount`.

extern crate alloc;

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
    let treasury: ContractPackageHash = runtime::get_named_arg("treasury");

    // 1. Fresh cargo purse owned by this session account.
    let cargo_purse = system::create_purse();

    // 2. Move `amount` motes into the cargo purse.
    system::transfer_from_purse_to_purse(account::get_main_purse(), cargo_purse, amount, None)
        .unwrap_or_revert();

    // 3. Invoke the package's latest version of `deposit` (contract_version = None),
    //    handing it the cargo purse. Odra's `handle_attached_value` drains it.
    let _: () = runtime::call_versioned_contract(
        treasury,
        None,
        "deposit",
        runtime_args! { "cargo_purse" => cargo_purse },
    );
}
