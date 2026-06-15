# nebula — demo script (≈ 3–4 min)

Theme to land: **verifiable autonomy** — the agent does real on-chain work, but provably can’t do the wrong thing.

> Execution path: the **public** console (nebulaai.space) has writes disabled for safety. Demo real
> signing via the **CLI** (`nebula`) or a **local web instance with writes enabled**
> (`NEBULA_POLICY_READONLY=0`). Reads/analytics can be shown on the public console.

---

## Setup (before recording)
- Operator wallet with a little MNT on Mantle mainnet (5000).
- Policy cap set deliberately low so the block is visible, e.g. `NEBULA_POLICY_MAX_NATIVE_MNT=25`.
- CLI: `bun add -g nebula-ai-agent` → `nebula init` → fund the derived agent wallet.
- Have nebulaai.space open in a tab for the reads/identity beats.

---

## Beat 0 — the hook (15s)
> “Everyone’s building AI agents for crypto. Nobody sane gives one their treasury keys.
> nebula does — because it *can’t* do the wrong thing, and you can verify that on-chain.”

Show the one-liner: **the AI advises, deterministic code enforces.**

## Beat 1 — real analysis, real risk (35s)
- Ask: *“What are the best stablecoin yields on Mantle right now?”*
- Agent returns DeFiLlama yields **and flags restricted RWAs** (USDY / MI4 / mUSD) as not freely eligible.
- (Optional) *“Is 0x… safe to send to?”* → Nansen risk label.
- **Point:** it’s not a generic chatbot — it knows Mantle, yields, and risk.

## Beat 2 — execute, gated (45s)
- Ask: *“Swap 5 MNT to USDC.”*
- Show the **confirm card**: the action, then **Execute with — Agent wallet · 0x… / Connected wallet · 0x…**
- Choose a wallet → it **simulates first**, then signs and broadcasts → tx hash → open on MantleScan.
- **Point:** every write is simulated before it touches a wallet; you choose who signs.

## Beat 3 — the money shot: it says NO (40s)
- Ask: *“Send 100 MNT to 0x….”* (above the 25 MNT cap)
- The **policy gate rejects it** — clear message: exceeds the native cap. Nothing is signed.
- > “That refusal isn’t the model being cautious — it’s deterministic code. A jailbroken prompt
>   gets the same answer. *That’s* the difference.”
- **Point:** this is verifiable autonomy — the guardrail is code, not vibes.

## Beat 4 — lend, with a health factor (30s)
- Ask: *“Supply 10 USDC to Aave.”* → approve-then-supply, simulated → executed.
- Ask: *“What’s my position?”* → collateral / debt / **health factor**.
- **Point:** real DeFi, not a toy — Aave V3 on Mantle with safety context.

## Beat 5 — provable identity (25s)
- On nebulaai.space: open **Agents** (ERC-8004 browser) — show the agent’s on-chain identity.
- > “The agent has an identity and a track record on Mantle via ERC-8004 — anyone can verify it.”
- **Point:** trust is checked on-chain, not claimed in a pitch.

## Close (15s)
> “Reads, swaps, lending — all real, all on Mantle. Every write simulated, policy-checked, and
> signed by *your* wallet. The agent never holds your keys, and its identity is on-chain.
> The AI advises; code enforces. That’s nebula — verifiable autonomy, live today.”

---

## If anything fails live (fallbacks)
- RPC slow → show `/status` (live block + latency) to prove the chain layer is healthy.
- Don’t want to spend funds → run with `NEBULA_POLICY_AUTONOMY=confirm` and stop at the simulation/confirm step; the block (Beat 3) still lands without spending.
- Web writes disabled → do Beats 2–4 in the CLI; keep Beats 1 & 5 on the web console.

## One-line backups (for Q&A)
- **“Is it custodial?”** No — keys never leave you; the server only prepares policy-checked actions.
- **“What if the model is wrong?”** The gates are deterministic code; a wrong model can’t breach a cap.
- **“What’s on mainnet?”** Execution + ERC-8004 registries on Mantle 5000; Aave is mainnet-only.
- **“Sponsors?”** Mantle, Merchant Moe + Agni, Aave, Nansen, DeFiLlama, Bybit (read-only).
