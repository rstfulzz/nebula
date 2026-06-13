# Claude Project Instructions

Use `knowledge/00-project-knowledge.md` as the canonical project context. Then read
`knowledge/product/recommended-concept.md` and only the ecosystem or reference pages
needed for the current task.

The project direction is a Mantle-native, policy-aware AI treasury assistant.
Its defensible value is unified risk analysis, RWA eligibility awareness,
transaction simulation, enforceable policy controls, approvals, and auditable
execution. It is not a generic chatbot or an APY-ranking bot.

Implementation constraints:

- Use Mantle for execution and settlement.
- Use official contracts, ABIs, SDKs, and RPC data for transactions.
- Treat DeFiLlama as analytics and discovery only.
- Treat MI4, USDY, and mUSD as restricted products.
- Separate read, transfer, swap, wrap, mint, redeem, and bridge capabilities.
- Keep AI advisory; enforce fund controls in deterministic code/contracts.
- Simulate every write and require approval for material-risk actions.
- Treat CIAN as read-only until a supported integration is confirmed.
- Keep IntentX leverage and hedging strictly bounded and opt-in.
- Prefer Pendle for phase-two maturity and fixed-yield analytics.
- Treat SolvBTC/xSolvBTC as layered BTC exposure rather than native FBTC.
- Do not conflate EigenLayer with Mantle's use of EigenDA.

Research was reviewed on June 13, 2026. Reverify volatile facts and update the
relevant structured page before depending on them. Treat `knowledge/` as the sole
project knowledge source.
