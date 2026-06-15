---
name: nebula-mantle-pools
description: "Discover Mantle yields and DEX pools: scan DeFiLlama yields, flag restricted RWAs, and read Agni/Merchant Moe pool data before acting."
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

# nebula · Mantle pools & yields (discovery)

The Mantle-native analog of Byreal's `overview` / `pools list` / `pools analyze` — but on **Mantle**.
Read-only discovery to inform any swap or LP decision. No wallet required.

## Capabilities (nebula tools)
- `defi.yields` — Mantle yields via DeFiLlama, with **restricted-asset flags** (USDY / MI4 / mUSD).
- `swap.quote` / `moe.quote` — live price + depth on **Agni V3** and **Merchant Moe** (Liquidity Book).
- `portfolio` / `aave.markets` — current balances and live Aave V3 supply/borrow APRs.

## Steps
1. **Scan yields** — rank Mantle opportunities by APR and TVL; surface the restricted-asset flags so the
   agent never proposes an ineligible RWA.
2. **Read pool depth** — quote the candidate pairs on Agni and Merchant Moe to estimate price impact.
3. **Report** a ranked, human-readable shortlist with APR, TVL, and any eligibility warnings — never `-o json` to the user.

## Mantle venues this reads
- Agni V3 Quoter `0x9488C05a7b75a6FefdcAE4f11a33467bcBA60177`
- Merchant Moe Quoter `0x501b8AFd35df20f531fF45F6f695793AC3316c85`
- Aave V3 Pool `0x458F293454fE0d67EC0655f3672301301DD51422`
