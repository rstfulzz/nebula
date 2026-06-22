---
name: nebula-casper-swap
description: "Policy-guarded token swap on Casper via Friendly Market (Testnet DEX): quote, guardrail, then sign locally — CSPR/csprUSD and CEP-18 pairs."
metadata:
  openclaw:
    homepage: https://github.com/rstfulzz/nebula
    requires:
      bins:
        - nebula
    install:
      - kind: node
        package: "nebula-ai-agent"
        global: true
---

# nebula · Casper swap (policy-guarded)

Swap on Casper through **Friendly Market** — the Uniswap-V2-style DEX live on Casper Testnet
(`testnet.friendly.market`) — under nebula's discipline: **quote → guardrail → confirm.** CSPR.trade is
used for mainnet price reference. The agent proposes; deterministic policy decides; your key signs
locally (no custody).

## Capabilities (nebula tools)
- quote CSPR/csprUSD and CEP-18 pairs on Friendly Market (constant-product `x*y=k`, 0.3% fee).
- execute the swap: build → sign locally → verify the on-chain execution result.

## Steps
1. **Quote** the pair on Friendly Market and estimate price impact.
2. **Guardrail** (`nebula-treasury-guardrail`): reject if slippage > cap or notional > per-tx cap.
3. **Confirm and execute — only after approval**; then verify the on-chain result.
4. **Report** the Casper tx hash (`testnet.cspr.live`) and realized amounts in full.

## Casper venue
- Friendly Market (Testnet) — `testnet.friendly.market` (capture router / pool package hashes at integration time).
- csprUSD — the CEP-18 stablecoin live on Casper Testnet.

## Rules
- A quote must precede every execute. No blind swaps.
- 1 CSPR = 1e9 motes; recipients/owners are public keys / account hashes, not addresses.
- Show complete public keys and tx hashes — never truncate.
