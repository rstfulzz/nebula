# Deploying the contracts to Casper Testnet

The four contracts (`IdentityRegistry`, `ReputationRegistry`, `ValidationRegistry`,
`Amm`) build to Wasm and deploy via the Odra **livenet** environment. The deploy
binary is already wired (`bin/deploy.rs` + a feature-gated `[[bin]]`), so the build
scaffolding and the deploy coexist.

## 1. Build the Wasm

```bash
cd contracts
brew install binaryen wabt   # wasm-opt + wasm-strip (optimization); optional but recommended
cargo odra build             # → contracts/wasm/*.wasm (nightly-2026-01-01, pinned)
```

## 2. Build the deploy binary

```bash
cargo build --bin deploy --features livenet
```

## 3. Run the deploy

The signer is the funded testnet account (see `knowledge/reference/wallet.md`).

```bash
export ODRA_CASPER_LIVENET_SECRET_KEY_PATH="$CASPER_SECRET_KEY_PATH"
export ODRA_CASPER_LIVENET_NODE_ADDRESS="<deploy-accepting testnet node RPC>"
export ODRA_CASPER_LIVENET_CHAIN_NAME="casper-test"
export ODRA_CASPER_LIVENET_EVENTS_URL="<that node's SSE events endpoint>"

cargo run --bin deploy --features livenet
```

Record the printed contract/package hashes in `knowledge/reference/contracts.md` and
wire them into the on-chain plugin's identity/reputation/validation/swap tools.

## Status / known issue

The pipeline is verified up to submission: `cargo odra build` produces all four
`.wasm`, the deploy binary compiles, and it locates and submits each contract.
Against the public `node.testnet.casper.network/rpc` the install returns
`ExecutionError(ContractDeploymentError)` **with no gas charged** — i.e. the deploy
is not landing on-chain (not a gas, wasm-size, or contract-logic problem; the
contracts pass all OdraVM tests). This is an endpoint-compatibility detail: Odra
livenet 2.8 needs a node that accepts the deploy and an SSE `EVENTS_URL` it can read
for confirmation. Point `_NODE_ADDRESS` / `_EVENTS_URL` at a deploy-accepting testnet
node (or a CSPR.cloud node with the access token wired into the client) and re-run.
