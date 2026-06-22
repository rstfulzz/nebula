//! Nebula on-chain contracts for Casper (Odra / Rust → Wasm).
//!
//! - Agent-trust registries: [`IdentityRegistry`], [`ReputationRegistry`],
//!   [`ValidationRegistry`].
//! - Swap: [`Amm`], a constant-product pool engine.

pub mod amm;
pub mod identity;
pub mod reputation;
pub mod validation;

pub use amm::Amm;
pub use identity::IdentityRegistry;
pub use reputation::ReputationRegistry;
pub use validation::ValidationRegistry;
