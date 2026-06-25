#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]
//! Nebula on-chain contracts for Casper (Odra / Rust → Wasm).
//!
//! - Agent-trust registries: [`IdentityRegistry`], [`ReputationRegistry`],
//!   [`ValidationRegistry`].
//! - Swap: [`Amm`], a constant-product pool engine.

extern crate alloc;

pub mod amm;
pub mod cep3009;
pub mod exchange;
pub mod identity;
pub mod reputation;
pub mod token;
pub mod treasury;
pub mod validation;

pub use amm::Amm;
pub use cep3009::PayToken;
pub use exchange::PayExchange;
pub use identity::IdentityRegistry;
pub use reputation::ReputationRegistry;
pub use token::Token;
pub use treasury::Treasury;
pub use validation::ValidationRegistry;
