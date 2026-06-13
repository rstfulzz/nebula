# Codex Project Instructions

## Required Context

Before planning or implementing this project, read:

1. `knowledge/00-project-knowledge.md`
2. `knowledge/product/recommended-concept.md`
3. The relevant ecosystem page under `knowledge/ecosystem/`
4. `knowledge/reference/contracts.md` for any on-chain integration

Treat the structured pages under `knowledge/` as the sole project knowledge source.
Add verified findings to the relevant page rather than creating a separate
research archive.

## Product Direction

The default product is a policy-aware AI treasury assistant for Mantle. It
combines portfolio visibility, explainable recommendations, deterministic risk
checks, transaction simulation, approval, and auditable on-chain execution.

AI must produce useful analysis and proposals. Deterministic code and smart
contracts must enforce permissions, limits, eligibility, and execution rules.
Never let an LLM directly control unrestricted funds.

## Integration Rules

- Mantle must be the execution and settlement layer, not a decorative deploy.
- Prefer official contract registries, ABIs, SDKs, and RPC data.
- Do not use DeFiLlama to construct transactions.
- Treat MI4, USDY, and mUSD as restricted assets with eligibility constraints.
- Distinguish read, transfer, swap, wrap, mint, redeem, and bridge operations.
- Require simulation and explicit approval for writes.
- Start CIAN as read-only unless its team confirms a supported write interface.
- Keep IntentX hedging opt-in and bounded by strict leverage policies.
- Treat Pendle as the preferred phase-two fixed-yield analytics integration.
- Treat SolvBTC/xSolvBTC as layered BTC risk, not equivalent to native FBTC.
- Do not claim EigenLayer is deployed on Mantle. An EigenLayer AVS is optional
  Ethereum-side verification infrastructure; EigenDA is separate.

## Knowledge Maintenance

The research snapshot was reviewed on June 13, 2026. Reverify time-sensitive
facts before relying on them, then update the relevant structured document and
its `Last reviewed` line. Keep `CLAUDE.md` aligned with these instructions.
