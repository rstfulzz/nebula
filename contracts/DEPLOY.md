# Deploying the contracts to Casper Testnet

The four contracts (`IdentityRegistry`, `ReputationRegistry`, `ValidationRegistry`,
`Amm`) are **live on Casper Testnet** (hashes below). This documents the build +
deploy that landed them, via `scripts/casper/deploy.ts` (casper-js-sdk against a
CSPR.cloud node — it accepts deploys with the access-token header and the result
is polled over RPC, so no SSE events endpoint is needed).

## Deployed (Casper Testnet, `casper-test`)

| Contract | Named key | Package hash |
| --- | --- | --- |
| IdentityRegistry | `nebula_identity_registry` | `hash-6bdd40e13b7dc72327076b048998269d258a48b9b4c4301567e29928521b65e9` |
| ReputationRegistry | `nebula_reputation_registry` | `hash-a4ddaf4b17f0f3a6185448766debd83d1b989234f3f8f7f60cd099feb7e4ecb6` |
| ValidationRegistry | `nebula_validation_registry` | `hash-62de108087ea262411b4777bf9ceb927f4abf615ffd9664620dbc05b91aa552e` |
| Amm | `nebula_amm` | `hash-5186f0461a45add62c3473e038c2984594ce004b29925f581820e5c2c4fa7938` |

Wire these into `NEBULA_{IDENTITY,REPUTATION,VALIDATION,AMM}_PACKAGE_HASH` (the
registry clients in `packages/*` and `apps/web` read them); the identity /
reputation / validation reads go live once they're set.

## 1. Build the MVP Wasm

Two things matter, both already in the repo:

- **`build.rs`** (`odra_build::build()`) — without it the `odra_module` cfg is
  never set, so the macro never emits Casper's `call` entry point and install fails
  with *"Module doesn't have export call"*.
- **`.cargo/config.toml`** — recent Rust enables post-MVP Wasm features
  (bulk-memory, sign-ext) the Casper VM rejects. The build targets the MVP feature
  set; the deploy script then runs `wasm-opt` lowering passes as a belt-and-braces
  (`--signext-lowering --llvm-memory-copy-fill-lowering --memory-packing`).

```bash
cd contracts
brew install binaryen           # wasm-opt (for the MVP lowering pass)
cargo odra build                # → contracts/wasm/*.wasm (nightly-2026-01-01, pinned)
# the deploy script lowers each wasm to MVP before submitting (see below)
```

## 2. Run the deploy

```bash
# env: CASPER_SECRET_KEY_PATH (funded signer), CSPR_CLOUD_API_KEY, CASPER_NODE_RPC,
#      CASPER_CHAIN_NAME=casper-test
bun run scripts/casper/deploy.ts                     # all four
bun run scripts/casper/deploy.ts IdentityRegistry    # or one
```

The script installs each contract with the exact Odra install args the generated
`call()` reads — `odra_cfg_package_hash_key_name` (String),
`odra_cfg_allow_key_override` (Bool), `odra_cfg_is_upgradable` (Bool), and
`odra_cfg_is_upgrade` (Bool, `false`) — then polls the RPC for the execution result
and prints the testnet.cspr.live transaction link. Read the package hashes back from
the deployer account's named keys (`state_get_account_info`).

Install cost ≈ 200–300 CSPR per contract (the MVP-lowered wasm is ~200 KB).
