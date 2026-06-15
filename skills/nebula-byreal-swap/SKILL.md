---
name: nebula-byreal-swap
description: "Policy-guarded token swap on Byreal: preview, check slippage and caps, then execute only after explicit confirmation."
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

# nebula · Byreal swap (policy-guarded)

Execute a token swap on Byreal through `byreal-cli`, wrapped in nebula's four-step discipline:
**discover → preview → guardrail → confirm.** The agent proposes; the rules decide.

## Steps

1. **Verify the wallet** — never act on an unknown signer.
   ```bash
   byreal-cli wallet address
   ```
2. **Discover the exact parameters** for the swap capability before building the call.
   ```bash
   byreal-cli catalog show swap
   ```
3. **Preview (dry-run) — always first.** Never skip to a live swap.
   ```bash
   byreal-cli swap --from <TOKEN_IN> --to <TOKEN_OUT> --amount <AMT> --slippage-bps <BPS> --dry-run
   ```
4. **Run the guardrail** (see the `nebula-treasury-guardrail` skill). Reject if:
   - slippage > 200 bps (warn) or above the user's cap,
   - notional value exceeds the per-tx cap,
   - the route touches a restricted/ineligible asset.
5. **Confirm and execute — only after the user approves**, and only if the guardrail passed.
   ```bash
   byreal-cli swap --from <TOKEN_IN> --to <TOKEN_OUT> --amount <AMT> --slippage-bps <BPS> --confirm
   ```
6. **Report** the full transaction signature and the realized amounts. Do not truncate addresses.

## Rules
- A dry-run preview must precede every `--confirm`.
- For swaps above ~$1000 notional, require an explicit user confirmation, not just approval-by-default.
- Omit `-o json` when showing results to the user; show the human-readable output.
- If the wallet isn't configured, stop and instruct the user to run `byreal-cli setup` — never ask them to paste a private key.
