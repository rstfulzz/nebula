---
name: nebula-mantle-swap
description: "Policy-guarded token swap on Mantle via Agni V3 and Merchant Moe: best-route quote, simulate, guardrail, then sign with your wallet."
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

# nebula · Mantle swap (policy-guarded)

The Mantle-native analog of Byreal's `swap execute` — but routed on **Mantle** through Agni V3 and
Merchant Moe, under nebula's discipline: **quote → simulate → guardrail → confirm.** The agent
proposes; deterministic policy decides; your wallet signs (no custody).

## Capabilities (nebula tools)
- `swap.best` — quote both **Agni V3** and **Merchant Moe** and pick the better pool.
- `swap.quote` / `moe.quote` — per-venue quotes with price impact.
- `swap.execute` / `moe.swap` — build the calldata; the connected (or derived agent) wallet signs.

## Steps
1. **Quote the best route.**
   ```
   swap.best { tokenIn, tokenOut, amountIn }   # compares Agni V3 vs Merchant Moe
   ```
2. **Simulate** the chosen route against live Mantle state (revert / drift check).
3. **Guardrail** (`nebula-treasury-guardrail`): reject if slippage > cap, notional > per-tx cap, or the
   route touches a restricted asset (USDY / MI4 / mUSD).
4. **Confirm and execute — only after approval** and only if the guardrail passed. The wallet signs; no
   server key is ever used.
5. **Report** the Mantle tx hash (mantlescan.xyz) and realized amounts in full.

## Mantle venues
- Agni V3 SwapRouter `0x319B69888b0d11cEC22caA5034e25FfFBDc88421`
- Merchant Moe Router `0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a`

## Rules
- A quote + simulation must precede every execute. No blind swaps.
- Confirm explicitly above ~$1000 notional; warn above 200 bps slippage.
- Show complete addresses and tx hashes — never truncate.
