---
name: nebula-mantle-lp
description: "Put Mantle capital to work: supply/withdraw/borrow/repay on Aave V3 with health-factor tracking, all policy-gated and simulated."
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

# nebula · Mantle yield & positions

The Mantle-native analog of Byreal's `positions` (open / close / claim) — but on **Mantle**, via
**Aave V3**: supply for yield, borrow against collateral, withdraw, repay — each simulated and gated.

## Capabilities (nebula tools)
- `aave.markets` — live reserves and APRs (read).
- `aave.position` — current collateral, debt, and **health factor** (read).
- `aave.supply` / `aave.withdraw` / `aave.borrow` / `aave.repay` — write, policy-gated and signed by you.

## Steps
1. **Read the market and your position** — APRs, collateral, debt, and health factor.
2. **Plan** — state the action, amount, expected APR, and the resulting health factor *before* acting.
3. **Guardrail** (`nebula-treasury-guardrail`): amount within cap, post-action health factor above the
   floor, no restricted assets. Borrows that would push health factor toward liquidation are rejected.
4. **Approve-then-supply / confirm** — for supply/repay, approve the token first, then execute; all
   writes are simulated, then signed by your wallet.
5. **Report** the Mantle tx hash and the new position (collateral / debt / health factor).

## Mantle venue
- Aave V3 Pool `0x458F293454fE0d67EC0655f3672301301DD51422`

## Rules
- Never let a borrow drop the health factor below the configured safety floor.
- Simulate before every write; confirm explicitly for material-risk actions.
- Claim/realize only when net-positive after gas.
