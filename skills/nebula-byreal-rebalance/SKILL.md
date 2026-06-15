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
rebalance end-to-end — each write gated by the same preview → guardrail → confirm pattern. This is the
"agentic wallet economy" loop: many steps, one policy.

## Steps

1. **Read the wallet and balances.**
   ```bash
   byreal-cli wallet address
   byreal-cli catalog list          # discover the exact balance/pool/position capability ids
   ```
2. **Analyze candidate pools** — APR, TVL, volume, and risk. Prefer deep, low-risk pools.
   ```bash
   byreal-cli catalog show pools
   # then query pools per the discovered parameters (APR / TVL / volume)
   ```
3. **Decide the target allocation** from the analysis. State the plan to the user *before* acting:
   which pool, what size, expected APR, and why.
4. **Guardrail the plan** (`nebula-treasury-guardrail`): position size within cap, slippage within
   limit, no restricted assets, total exposure within the envelope. Abort the whole sequence if it fails.
5. **Swap into the target asset(s)** — dry-run, then confirm (reuse `nebula-byreal-swap`).
6. **Open the CLMM position** — preview first, then confirm.
   ```bash
   byreal-cli catalog show position-open
   # dry-run, guardrail, then --confirm
   ```
7. **Report** the full sequence: every signature, the new position, fees/range, and the resulting
   allocation. Surface the decision trail so the run is auditable.

## Rules
- Present the full multi-step plan and get approval before the first write; material-risk steps each confirm.
- Every individual write still follows dry-run → guardrail → confirm — autonomy never skips the gates.
- If any step fails or drifts beyond tolerance, stop and report; do not "push through" a partial rebalance.
- Claim fees/rewards (`byreal-cli` positions) only when it is net-positive after costs.
