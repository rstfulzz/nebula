---
name: nebula-casper-pools
description: "Discover Casper earn opportunities: list validators (staking yield) and read Friendly Market pools before acting. Read-only, no signer required."
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

# nebula · Casper pools & yields (discovery)

Read-only discovery to inform a stake or swap decision on Casper. No signer required.

## Capabilities (nebula tools)
- `casper.validators` — the validator set + commission (the basis for staking yield).
- `casper.balance` — current main-purse CSPR balance.
- Friendly Market pools — CSPR/csprUSD and CEP-18 pair depth (read).

## Steps
1. **List validators** — rank by commission / total stake for delegation (the native earn path).
2. **Read pool depth** — Friendly Market pairs, to estimate swap price impact.
3. **Report** a ranked, human-readable shortlist with commission/yield and depth — never raw JSON to the user.

## Notes
- On Casper, "earn" is staking-first (native delegation) — see `nebula-casper-stake`.
- Lending venues (e.g. Wise Lending) are roadmap on Testnet; do not propose a venue that isn't live.
