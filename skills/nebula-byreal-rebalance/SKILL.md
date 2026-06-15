---
name: nebula-byreal-rebalance
description: "Autonomous multi-step rebalance: read balances, analyze Byreal pools by APR and risk, swap, then open a CLMM position within policy limits."
metadata:
  openclaw:
    homepage: https://github.com/rstfulzz/nebula
    requires:
      bins:
        - byreal-cli
      config:
        - ~/.config/byreal/keys/
    install:
      - kind: node
        package: "@byreal-io/byreal-cli"
        global: true
---

# nebula · Byreal rebalance (autonomous, multi-step)

A multi-step **agentic** workflow: the agent reads state, reasons over live pool data, and executes a
rebalance end-to-end — each write gated by preview → guardrail → confirm. This is the "agentic wallet
economy" loop: many steps, one policy. Commands verified against `byreal-cli` v0.3.6.

## Steps

1. **Read wallet and balances.**
   ```bash
   byreal-cli wallet address
   byreal-cli wallet balance
   ```
2. **Analyze candidate pools** — APR, TVL, volume, risk. Prefer deep, low-risk pools.
   ```bash
   byreal-cli pools list
   byreal-cli catalog show dex.pool.analyze
   byreal-cli pools analyze <POOL_ID>
   ```
3. **Decide the target allocation** and state the plan to the user *before* acting: which pool, what
   size, expected APR, and why.
4. **Guardrail the plan** (`nebula-treasury-guardrail`): position size within cap, slippage within
   limit, no restricted assets, total exposure within the envelope. Abort the whole sequence if it fails.
5. **Swap into the target asset(s)** — dry-run, then confirm (reuse `nebula-byreal-swap`):
   ```bash
   byreal-cli swap execute --input-mint <IN> --output-mint <OUT> --amount <AMT> --slippage <BPS> --dry-run
   ```
6. **Open the CLMM position** — discover params, preview, guardrail, then confirm.
   ```bash
   byreal-cli catalog show dex.position.open
   byreal-cli positions open <PARAMS> --dry-run
   byreal-cli positions open <PARAMS> --confirm
   ```
7. **Report** the full sequence: every signature, the new position and range, fees, and the resulting
   allocation. Manage with `byreal-cli positions list`; claim fees only when net-positive
   (`byreal-cli catalog show dex.position.claim`).

## Rules
- Present the full multi-step plan and get approval before the first write; material-risk steps each confirm.
- Every individual write still follows dry-run → guardrail → confirm — autonomy never skips the gates.
- If any step fails or drifts beyond tolerance, stop and report; never "push through" a partial rebalance.
