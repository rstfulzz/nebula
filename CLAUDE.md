# Claude Project Instructions

Use `knowledge-casper/00-project-knowledge.md` as the canonical project context.
Then read `knowledge-casper/product/build-directions.md` and only the casper,
ecosystem, migration, or reference pages needed for the current task. `knowledge/`
is the **archived** Mantle/EVM research, kept only for migration reference — do not
treat it as current.

The project direction is a Casper-native, policy-aware agentic AI treasury and
agent-trust assistant for the Casper Agentic Buildathon. Its defensible value is
unified risk analysis, transaction simulation, enforceable policy controls,
approvals, auditable execution, and verifiable agent identity / reputation /
validation. It is not a generic chatbot or an APY-ranking bot.

Status: migrating from the original Mantle/EVM implementation to Casper. See
`knowledge-casper/migration/plan.md`. Until a module is migrated, its Mantle code is
legacy.

Implementation constraints:

- Use Casper Network (Testnet for the buildathon) for execution and settlement.
- Write contracts in Rust with the Odra framework; deploy as Wasm. Use contract
  package versioning for upgrades — no proxy/delegatecall patterns.
- Use casper-js-sdk (v5) for client/RPC and casper-client for keys/CLI. Do not use
  viem/ethers/wagmi on Casper paths.
- Use CSPR.cloud for indexed reads and event streaming; emit contract events via
  CES (Casper Event Standard).
- Use CEP-18 for fungible tokens and CEP-78 for the agent identity NFT. Model
  balances as purses; model identity as account-hash / `Key`, never an EVM address.
- Replace the Safe + Zodiac treasury with native associated keys / weights /
  thresholds plus a Casper scoped-execution contract. Keyless agent execution must
  be bounded on-chain and owner-revocable.
- Use x402 for agent micropayments and casper-eip-712 for typed-data signing.
- Use a Casper MCP server for read access to chain state where helpful.
- Keep AI advisory; enforce fund controls in deterministic code/contracts.
- Simulate every write and require approval for material-risk actions.
- 1 CSPR = 10^9 motes. There is no `msg.sender` — use `get_caller` / the call stack.
- Do not assume EVM DeFi (Aave, Agni, Merchant Moe) equivalents exist on Casper;
  verify a live Casper DEX/lending venue before building swap/lending write paths.

Secrets: never commit seed phrases or secret keys. The deployer wallet's public
identity is in `knowledge-casper/reference/wallet.md`; its secret key stays in an
env-referenced file outside the repo.

Research was reviewed on June 22, 2026. Reverify volatile facts (2.0 feature
activation, endpoints, contract addresses, SDK versions) before depending on them.
Treat `knowledge-casper/` as the sole current project knowledge source.
