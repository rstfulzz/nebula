---
name: nebula-treasury-guardrail
description: "Deterministic safety gate for agent skills: reject over-cap or high-slippage actions, require an approval for material risk, and verify execution on-chain."
metadata:
  openclaw:
    homepage: https://github.com/rstfulzz/nebula
---

# nebula · treasury guardrail

The deterministic gate that every value-moving skill must pass before it executes. This is nebula's
core thesis as a reusable skill: **the AI advises, the rules decide.** A wrong or jailbroken prompt
gets the same answer — the limits are not negotiable.

Run this check against any proposed action *before* any execute / `--confirm`.

## Checks (reject if any fail)

1. **Per-transaction cap** — the native amount must not exceed the configured cap
   (`NEBULA_POLICY_MAX_NATIVE_CSPR`). Over-cap → **reject**.
2. **Auto-execute ceiling** — amounts above `NEBULA_POLICY_AUTO_MAX_NATIVE_CSPR` require explicit
   approval, not approval-by-default.
3. **Slippage limit** (swaps) — reject above the user's hard slippage cap.
4. **Recipient / token allowlist** — if configured, the recipient public key or CEP-18 package hash
   must be on the allowlist; otherwise **reject**. Eligibility is not advice — it blocks.
5. **Minimum delegation** (staking) — a delegate below 500 CSPR is invalid; **reject**.
6. **Execution verification** — after broadcast, confirm the on-chain execution result
   (`errorMessage` empty); a failed transaction still consumes gas, so a balance delta alone is not proof.
7. **Known signer** — the signer must be the verified active key; otherwise stop.

## Output
Return a clear verdict: `ALLOW` or `REJECT`, with the specific rule(s) that fired and the offending
value. On `REJECT`, do not execute and explain why in one line the user can act on.

## Why this exists
Demonstrating a **successful action and a policy-rejected action** is the heart of verifiable
autonomy: capability you can trust because its limits are provable, not promised.
