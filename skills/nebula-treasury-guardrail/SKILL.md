---
name: nebula-treasury-guardrail
description: "Deterministic safety gate for agent skills: reject over-cap, restricted-asset, or high-slippage actions before any execute, and require dry-run first."
metadata:
  openclaw:
    homepage: https://github.com/rstfulzz/nebula
---

# nebula · treasury guardrail

The deterministic gate that every value-moving skill must pass before it executes. This is nebula's
core thesis as a reusable skill: **the AI advises, the rules decide.** A wrong or jailbroken prompt
gets the same answer — the limits are not negotiable.

Run this check against any proposed action *after* its dry-run preview and *before* any `--confirm`.

## Checks (reject if any fail)

1. **Per-transaction cap** — the notional value must not exceed the configured cap
   (e.g. `NEBULA_POLICY_MAX_NATIVE_MNT` for Mantle, or the user's set limit for Byreal). Over-cap → **reject**.
2. **Slippage limit** — warn above **200 bps**; reject above the user's hard slippage cap.
3. **High-value confirmation** — any action above **~$1000** notional requires explicit user
   confirmation, not approval-by-default.
4. **Restricted / ineligible assets** — refuse routes that touch assets the user isn't eligible to
   hold or that are flagged restricted (e.g. on Mantle: USDY / MI4 / mUSD). Eligibility is not advice — it blocks.
5. **Preview required** — if no dry-run preview was produced for this action, **stop**; never confirm blind.
6. **Known wallet** — the signer must be the verified active wallet; otherwise stop.

## Output
Return a clear verdict: `ALLOW` or `REJECT`, with the specific rule(s) that fired and the offending
value. On `REJECT`, do not execute and explain why in one line the user can act on.

## Why this exists
Demonstrating a **successful action and a policy-rejected action** is the heart of verifiable
autonomy: capability you can trust because its limits are provable, not promised.
