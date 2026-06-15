# Prompt — generate the nebula pitch deck as a PPT

Paste everything in the box below into an AI presentation tool (Gamma, Tome, Beautiful.ai)
or into ChatGPT/Claude (ask it to output a `.pptx` via python-pptx, or slide-by-slide content).

---

You are a senior product-pitch designer. Create a polished investor/hackathon **pitch deck** for a
product called **nebula**. Output a **16:9 slide deck of ~13 slides**. If you can generate a
downloadable `.pptx`, do so; otherwise produce, per slide: a headline, 2–4 tight bullets, a
visual/layout suggestion, and a one-line speaker note. Keep one idea per slide — no walls of text.

## About the product (context)
nebula is a **policy-aware AI treasury agent on Mantle** (an Ethereum L2). Tagline: **“The AI
advises. Deterministic code enforces.”** It does real on-chain work (read, swap, lend, transfer) but
every value-moving action passes deterministic gates before it can broadcast. It is submitted to the
**Mantle Turing Test 2026** hackathon; the theme is **verifiable autonomy**. It is live at
nebulaai.space, open source, with 6 published npm packages and ERC-8004 contracts deployed on Mantle.

## Design direction (important)
- **Mood:** premium, editorial, cosmic. It’s called *nebula* — lean into deep-space elegance, not clip art.
- **Palette:** near-black / deep charcoal background (#0E0D0A), warm cream text (#F9F8F6), muted grey
  for secondary text, one restrained accent (a soft violet→indigo or warm amber glow). High contrast.
- **Type:** a high-contrast serif for headlines (e.g. Fraunces / Playfair), a clean sans for body
  (Inter / Outfit), and a **monospace** for addresses, code, and labels.
- **Style:** generous whitespace, large headlines, subtle starfield/nebula texture or gradient,
  thin hairline rules, small mono “eyebrow” labels above headlines. Minimal, confident, technical.
- **Avoid:** stock business photos, emojis, dense paragraphs, gimmicky icons.

## Hard accuracy rules (do not invent)
Only state what’s below. Do **not** claim: Byreal/OpenClaw/RealClaw integration, a hosted/SaaS 24/7
gateway, Aave on testnet, or Tencent as a treasury feature. Bybit is **read-only**. Keep numbers and
addresses exactly as written.

## Slides

1. **Title** — “nebula”. Subhead: *Verifiable autonomy for on-chain treasuries, on Mantle.*
   Footer: nebulaai.space · npm `nebula-ai-agent` · open source. Visual: dark cosmic hero.

2. **Problem** — AI agents + money are stuck between **toothless chatbots** (can’t act) and
   **reckless key-holders** (can do anything). The gap is *trust you can verify*.

3. **Insight** — Separate **advice** from **authority**: the model proposes typed intents and never
   holds keys; deterministic code/contracts decide what’s allowed; identity lives on-chain.
   A wrong or jailbroken model still can’t breach a limit.

4. **Solution — the four-gate write pipeline** — every action: **Policy → Simulate → Approve →
   Execute → receipt.** The AI sits before gate 1; the gates are pure, unit-tested code. Visual: a
   horizontal 4-step pipeline diagram.

5. **Why it fits the theme (verifiable autonomy)** — On-chain identity via **ERC-8004** (Identity,
   Reputation, Validation registries) on **Mantle mainnet** + Sepolia; deterministic guardrails
   (policy is code, not a prompt); **no custody**.

6. **What it does (all shipped)** — Reads/risk: DeFiLlama yields (flags restricted USDY/MI4/mUSD),
   Nansen risk labels, Bybit balance (read-only). Execution (gated + simulated + you sign):
   transfer, wrap/unwrap, swaps (Agni + Merchant Moe; OpenOcean in web), Aave V3 supply/borrow/
   withdraw/repay (mainnet).

7. **Architecture** — Surfaces (Console · CLI · Telegram · Gateway) → advisory brain (no keys) →
   deterministic spine (policy · simulate · approval · ERC-8004) → sign with user wallet → Mantle.
   Visual: left-to-right system diagram.

8. **Safety is the moat** — No custody (no server-side key). Derived agent wallet = keccak256(sig),
   identical in web + CLI. Policy caps (max native MNT, slippage, allowlists, read-only mode).
   Bounded autonomy: auto inside an envelope, human approval for material risk.

9. **It’s real, not slideware** — Live: nebulaai.space. Published: 6 npm packages @0.3.x. On-chain:
   ERC-8004 on Mantle mainnet (Identity `0x00a818451dC072d449e92a21d02d6B68fc703588`) + Sepolia.
   Open source on GitHub.

10. **Ecosystem fit** — Mantle (execution/settlement), Merchant Moe + Agni (DEX), Aave V3 (lending),
    Nansen (risk), DeFiLlama (yields), Bybit (read-only CEX). Visual: logo/label row.

11. **Business model** — Individual (Free → Plus $19 → Pro $49), Team/DAO ($39/seat, managed for
    funds), API & SDK (free SDK + usage). Plus a small **execution fee** on routed swaps that
    monetizes even free users — the lever chatbots don’t have.

12. **Roadmap** — hosted, isolated gateway autonomy; richer policy (per-token/daily caps, multisig);
    security audit before scaled funds; managed treasury on an ERC-8004 track record.

13. **Close** — “How do I let it act without letting it wreck me?” The AI advises. Code enforces.
    Identity is on-chain. **Verifiable autonomy — live on Mantle today.** CTA: nebulaai.space.

## Final output
Deliver the deck. After the slides, include a short **speaker-notes** block (1–2 sentences per slide)
and keep the whole thing visually consistent with the design direction above.
