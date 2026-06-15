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

Execute a token swap on Byreal (Solana CLMM DEX) through `byreal-cli`, wrapped in nebula's discipline:
**discover → preview → guardrail → confirm.** The agent proposes; the rules decide.

Commands below are verified against `byreal-cli` v0.3.6.

## Steps

1. **Verify the wallet** — never act on an unknown signer.
   ```bash
   byreal-cli wallet address
   ```
2. **Discover exact parameters** for the swap capability before building the call.
   ```bash
   byreal-cli catalog show dex.swap.execute
   ```
3. **Preview (dry-run) — always first.** Token amounts use mint addresses; slippage is in basis points.
   ```bash
   byreal-cli swap execute --input-mint <MINT_IN> --output-mint <MINT_OUT> \
     --amount <AMT> --slippage <BPS> --dry-run
   ```
   For a **no-custody preview** (build the tx without a local key), use:
   ```bash
   byreal-cli swap execute --input-mint <MINT_IN> --output-mint <MINT_OUT> \
     --amount <AMT> --slippage <BPS> --unsigned-tx --wallet-address <PUBKEY>
   ```
4. **Run the guardrail** (`nebula-treasury-guardrail`). Reject if slippage > 200 bps (warn) or above the
   user's cap, notional exceeds the per-tx cap, or the route touches a restricted/ineligible asset.
5. **Confirm and execute — only after the user approves**, and only if the guardrail passed.
   ```bash
   byreal-cli swap execute --input-mint <MINT_IN> --output-mint <MINT_OUT> \
     --amount <AMT> --slippage <BPS> --confirm
   ```
6. **Report** the full transaction signature and realized amounts. Never truncate addresses/signatures.

## Rules
- A `--dry-run` preview must precede every `--confirm`.
- For swaps above ~$1000 notional, require an explicit user confirmation, not approval-by-default.
- Omit `-o json` when showing results to the user; show the human-readable table.
- If the wallet isn't configured, stop and tell the user to run `byreal-cli setup` — never ask for a pasted private key.
