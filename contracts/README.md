# nebula contracts — ERC-8004 (Trustless Agents) on Mantle

Self-contained Solidity implementing the full **ERC-8004 Trustless Agents** spec —
**Identity**, **Reputation**, and **Validation** registries — for [nebula](../README.md),
a Mantle-native, policy-aware AI treasury agent. No external dependencies (no
OpenZeppelin); the ERC-721 identity is implemented inline. solc `0.8.28`.

## Contracts

| Contract | File | What it does |
| --- | --- | --- |
| `NebulaIdentityRegistry` | [`src/NebulaIdentityRegistry.sol`](src/NebulaIdentityRegistry.sol) | ERC-721 agent identity: `register` / `setAgentCard` / `setAgentAddress` / `resolve` / `agentIdByAddress` / `totalAgents`. The tokenURI is the agent card. |
| `NebulaReputationRegistry` | [`src/NebulaReputationRegistry.sol`](src/NebulaReputationRegistry.sol) | On-chain feedback: `giveFeedback(agentId, score 0–100, tag, uri)` / `getReputation` / `getFeedback`. Aggregates count + score sum; blocks self-rating; bound to Identity. |
| `NebulaValidationRegistry` | [`src/NebulaValidationRegistry.sol`](src/NebulaValidationRegistry.sol) | Request/respond validation: `requestValidation` / `respondValidation` / `getValidation` / `totalValidations`. A requester can't validate their own request. |

## Deployed addresses

Live on Mantle — **mainnet (chain 5000)** and **Sepolia testnet (chain 5003)**:

| Registry | Mainnet `5000` | Sepolia `5003` |
| --- | --- | --- |
| Identity | `0x00a818451dC072d449e92a21d02d6B68fc703588` | `0x529ae7B0e8A8191c0307b918AA62f1Fc6557a621` |
| Reputation | `0x56b11a8f34eCb20899BD4E1eA539E194F007F361` | `0x0DA4162BdFaFd0b5a6Da4151E0415aEaBd87B521` |
| Validation | `0x4A222ec3D7e656ADFE28583219Bed3462973DECD` | `0x5eDa2Be8c2c24039952751C817a7E9C8E018628e` |

Explorer: [mantlescan.xyz](https://mantlescan.xyz) (mainnet) · [sepolia.mantlescan.xyz](https://sepolia.mantlescan.xyz) (testnet).
The CLI/SDK default to these; override per network with `NEBULA_{IDENTITY,REPUTATION,VALIDATION}_REGISTRY`.

## Build & test

[Foundry](https://book.getfoundry.sh) with config at the repo-root [`foundry.toml`](../foundry.toml)
(`src = contracts/src`, `libs = ["contracts/lib"]`, solc 0.8.28). `forge-std` is gitignored — fetch it first:

```bash
git clone --depth 1 https://github.com/foundry-rs/forge-std contracts/lib/forge-std
forge build
forge test          # 15 tests (identity, reputation, validation)
```

## Deploy

`rpc_endpoints` are defined in `foundry.toml` (`mantle_mainnet`, `mantle_testnet`). Deploy with plain
`CREATE` (the CREATE2 factory isn't present on Mantle mainnet):

```bash
forge script contracts/script/DeployIdentityRegistry.s.sol \
  --rpc-url mantle_mainnet --private-key $NEBULA_SIGNER_PRIVATE_KEY --broadcast
forge script contracts/script/DeployReputationValidation.s.sol \
  --rpc-url mantle_mainnet --private-key $NEBULA_SIGNER_PRIVATE_KEY --broadcast
```

See the [root README](../README.md#deployed-contracts-erc-8004) for how the agent uses these registries.
