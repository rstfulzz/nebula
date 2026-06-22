# Claude Project Instructions

Use `knowledge/00-project-knowledge.md` as the canonical project context. Then read
`knowledge/product/build-directions.md` and only the casper, ecosystem, or reference
pages needed for the current task. Treat `knowledge/` as the sole project knowledge
source.

The project direction is a Casper-native, policy-aware agentic AI treasury and
agent-trust assistant for the Casper Agentic Buildathon. Its defensible value is
unified risk analysis, transaction pre-checks, enforceable policy controls,
approvals, auditable execution, and verifiable agent identity / reputation /
validation. It is not a generic chatbot or an APY-ranking bot.

Implementation constraints:

- Use Casper Network (Testnet for the buildathon) for execution and settlement.
- Write contracts in Rust with the Odra framework; deploy as Wasm. Use contract
  package versioning for upgrades.
- Use casper-js-sdk (v5) for client/RPC and casper-client for keys/CLI.
- Use CSPR.cloud for indexed reads and event streaming; emit contract events via
  the Casper Event Standard (CES).
- Use CEP-18 for fungible tokens and CEP-78 for the agent identity token. Model
  balances as purses and identity as an account hash / `Key`.
- Treasury control uses native associated keys / weights / thresholds plus a
  scoped-execution contract. Keyless agent execution must be bounded on-chain and
  owner-revocable.
- Use x402 for agent micropayments and casper-eip-712 for typed-data signing.
- Use a Casper MCP server for read access to chain state where helpful.
- Keep AI advisory; enforce fund controls in deterministic code/contracts.
- Pre-check every write and require approval for material-risk actions; verify the
  on-chain execution result before reporting success.
- 1 CSPR = 10^9 motes. The caller is an account hash / public key (`get_caller`).
- Do not assume a DEX or lending venue exists on Casper Testnet; verify a live venue
  (e.g. Friendly Market) before building swap/lending write paths.

Secrets: never commit seed phrases or secret keys. The deployer wallet's public
identity is in `knowledge/reference/wallet.md`; its secret key stays in an
env-referenced file outside the repo.

Research was reviewed on June 22, 2026. Reverify volatile facts (2.0 feature
activation, endpoints, contract addresses, SDK versions) before depending on them.
