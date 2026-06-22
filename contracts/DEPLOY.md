# Deploying the contracts to Casper Testnet

The four contracts (`IdentityRegistry`, `ReputationRegistry`, `ValidationRegistry`,
`Amm`) build to Wasm and deploy via the Odra **livenet** environment.

## 1. Build the Wasm

```bash
cd contracts
cargo odra build          # → contracts/wasm/*.wasm (nightly toolchain, pinned)
```

## 2. Add a livenet deploy binary

Odra deploys from a small binary. Add to `Cargo.toml` (keep it out of the default
build so `cargo odra build`/`test` stay clean):

```toml
[dependencies]
odra-casper-livenet-env = { version = "2.8.1", optional = true }

[features]
livenet = ["odra-casper-livenet-env"]

[[bin]]
name = "deploy"
path = "bin/deploy.rs"
required-features = ["livenet"]
```

`bin/deploy.rs`:

```rust
use nebula_casper_contracts::{Amm, IdentityRegistry, ReputationRegistry, ValidationRegistry};
use odra::host::{Deployer, NoArgs};
use odra::prelude::Addressable;

fn main() {
    let env = odra_casper_livenet_env::env();

    env.set_gas(250_000_000_000);
    let identity = IdentityRegistry::deploy(&env, NoArgs);
    println!("IdentityRegistry   = {:?}", identity.address());

    env.set_gas(250_000_000_000);
    println!("ReputationRegistry = {:?}", ReputationRegistry::deploy(&env, NoArgs).address());

    env.set_gas(250_000_000_000);
    println!("ValidationRegistry = {:?}", ValidationRegistry::deploy(&env, NoArgs).address());

    env.set_gas(300_000_000_000);
    println!("Amm                = {:?}", Amm::deploy(&env, NoArgs).address());
}
```

> Note: declare the `[[bin]]` only when deploying — having it declared while running
> `cargo odra build` prevents cargo-odra from generating its own build bin.

## 3. Run the deploy

The signer is the funded testnet account (see `knowledge/reference/wallet.md`).

```bash
export ODRA_CASPER_LIVENET_SECRET_KEY_PATH="$CASPER_SECRET_KEY_PATH"
export ODRA_CASPER_LIVENET_NODE_ADDRESS="https://node.testnet.casper.network/rpc"
export ODRA_CASPER_LIVENET_CHAIN_NAME="casper-test"
export ODRA_CASPER_LIVENET_EVENTS_URL="https://node.testnet.casper.network/events/main"

cargo run --bin deploy --features livenet
```

Record the printed contract/package hashes in `knowledge/reference/` and wire them
into the on-chain plugin's identity/reputation/validation/swap tools.
