# Codex Project Instructions

## Required Context

Before planning or implementing this project, read:

1. `knowledge-casper/00-project-knowledge.md`
2. `knowledge-casper/product/build-directions.md`
3. The relevant Casper page under `knowledge-casper/casper/` (architecture,
   accounts-keys, transactions-gas, smart-contracts, odra, token-standards,
   sdks-tooling, evm-migration-map)
4. `knowledge-casper/migration/plan.md` for the Mantle→Casper migration status
5. `knowledge-casper/reference/` for the deployer wallet and sources

Treat the structured pages under `knowledge-casper/` as the sole current project
knowledge source. `knowledge/` is the **archived** Mantle/EVM research, kept only
for migration reference. Add verified findings to the relevant page rather than
creating a separate research archive.

## Product Direction

The product is a Casper-native, policy-aware agentic AI treasury and agent-trust
assistant for the Casper Agentic Buildathon. It combines portfolio visibility,
explainable recommendations, deterministic risk checks, transaction simulation,
approval, auditable on-chain execution, and verifiable agent identity / reputation
/ validation.

AI must produce useful analysis and proposals. Deterministic code and smart
contracts must enforce permissions, limits, eligibility, and execution rules.
Never let an LLM directly control unrestricted funds.

## Integration Rules

- Casper must be the execution and settlement layer (Testnet for the buildathon),
  not a decorative deploy.
- Write contracts in Rust with Odra; deploy as Wasm; upgrade via contract package
  versioning (no proxy/delegatecall).
- Use casper-js-sdk (v5) and casper-client; do not use viem/ethers/wagmi on Casper
  paths. Use CSPR.cloud for indexed reads and CES event streaming.
- Use CEP-18 for fungible tokens and CEP-78 for the agent identity NFT. Model
  balances as purses and identity as account-hash / `Key`, never an EVM address.
- Replace Safe + Zodiac with native associated keys / thresholds plus a Casper
  scoped-execution contract; keyless agent execution must be bounded on-chain and
  owner-revocable.
- Use x402 for agent micropayments and casper-eip-712 for typed-data signing; use
  a Casper MCP server for read access.
- Require simulation and explicit approval for writes.
- Do not assume EVM DeFi (Aave, Agni, Merchant Moe) equivalents exist on Casper;
  verify a live Casper DEX/lending venue before building swap/lending write paths.
- 1 CSPR = 10^9 motes; there is no `msg.sender` (use `get_caller` / the call stack).

## Knowledge Maintenance

The Casper research snapshot was reviewed on June 22, 2026. Reverify time-sensitive
facts (2.0 feature activation, endpoints, contract addresses, SDK versions) before
relying on them, then update the relevant structured document and its `Last
reviewed` line. Keep `CLAUDE.md` aligned with these instructions.
