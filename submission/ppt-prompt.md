# Prompt — generate the nebula pitch deck as a PPT

Paste everything in the box below into an AI presentation tool (Gamma, Tome, Beautiful.ai)
or into ChatGPT/Claude (ask it to output a `.pptx` via python-pptx, or slide-by-slide content).

Tightened to **8 core slides** (professional pitch length) **+ 2 optional appendix slides** for Q&A.

---

You are a senior product-pitch designer. Create a tight, professional hackathon **pitch deck** for a
product called **nebula**. Output a **16:9 deck of exactly 8 core slides, plus 2 optional appendix
slides**. If you can generate a downloadable `.pptx`, do so; otherwise produce, per slide: a headline,
**max 3 bullets** (short phrases, not sentences), a visual/layout suggestion, and a one-line speaker
note. One idea per slide. Keep it lean — this is a pitch, not a document.

## About the product (context)
nebula is a **policy-aware AI treasury agent on Mantle** (an Ethereum L2). Tagline: **“The AI
advises. Deterministic code enforces.”** It does real on-chain work (read, swap, lend, transfer) but
every value-moving action passes deterministic gates before it can broadcast. Submitted to the
**Mantle Turing Test 2026** hackathon; theme: **verifiable autonomy**. Live at nebulaai.space, open
source, 6 published npm packages, ERC-8004 contracts deployed on Mantle.

## Design direction (important)
- **Mood:** premium, editorial, cosmic — it’s *nebula*; lean into deep-space elegance, not clip art.
- **Palette:** near-black background (#0E0D0A), warm cream text (#F9F8F6), muted grey for secondary
  text, one restrained accent (soft violet→indigo or warm amber glow). High contrast.
- **Type:** high-contrast serif headlines (Fraunces / Playfair), clean sans body (Inter / Outfit),
  monospace for addresses/labels.
- **Style:** lots of whitespace, large headlines, subtle starfield/nebula gradient, hairline rules,
  small mono “eyebrow” labels above headlines. Minimal and confident.
- **Avoid:** stock photos, emojis, dense paragraphs, gimmicky icons, more than 3 bullets per slide.

## Hard accuracy rules (do not invent)
Do **not** claim: Byreal/OpenClaw/RealClaw integration, a hosted/SaaS 24/7 gateway, Aave on testnet,
or Tencent as a treasury feature. Bybit is **read-only**. Keep numbers/addresses exact.

## Core slides (8)

1. **Title** — “nebula”. Subhead: *Verifiable autonomy for on-chain treasuries, on Mantle.*
   Small footer: nebulaai.space · open source. Visual: dark cosmic hero, lots of space.

2. **The problem** — AI + money is stuck between two bad options: *toothless chatbots* (can’t act)
   and *reckless key-holders* (can do anything). The gap = **trust you can verify**.

3. **How it works — the four-gate pipeline** — the AI only proposes; deterministic code enforces.
   Every action: **Policy → Simulate → Approve → Execute**. A jailbroken model still can’t breach a
   limit. Visual: a clean horizontal 4-step pipeline. (This is the core slide — give it weight.)

4. **Verifiable autonomy = the moat** — On-chain identity via **ERC-8004** (Identity/Reputation/
   Validation) on **Mantle mainnet**; **no custody** (keys never leave you); policy is code, not a
   prompt. This is why you can point it at a treasury.

5. **What it does** — Reads/risk: DeFiLlama yields (flags restricted RWAs), Nansen risk labels,
   Bybit balance (read-only). Execution (gated + simulated + you sign): swaps (Agni + Merchant Moe /
   OpenOcean), Aave V3 lending, transfers. Footer logo row: Mantle · Merchant Moe · Agni · Aave ·
   Nansen · DeFiLlama.

6. **It’s real, today** — Live console at nebulaai.space · 6 npm packages · ERC-8004 on Mantle
   mainnet (`0x00a818451dC072d449e92a21d02d6B68fc703588`) · open source. Not a mockup.

7. **Business model** — Individual (Free → Plus $19 → Pro $49) · Team/DAO ($39/seat, managed for
   funds) · usage-based **execution fee** on routed swaps that monetizes even free users.

8. **Close** — “How do I let it act without letting it wreck me?” The AI advises. Code enforces.
   Identity is on-chain. **Verifiable autonomy — live on Mantle.** CTA: nebulaai.space.

## Appendix (optional — only if asked, keep out of the main flow)

A1. **Architecture** — Surfaces (Console · CLI · Telegram · Gateway) → advisory brain (no keys) →
    deterministic spine (policy · simulate · approval · ERC-8004) → sign with user wallet → Mantle.

A2. **Roadmap & safety** — hosted gateway autonomy; richer policy (per-token/daily caps, multisig);
    security audit before scaled funds; managed treasury on an ERC-8004 track record.

## Final output
Deliver the 8 core slides (then the 2 appendix slides), plus a short speaker-notes block
(1–2 sentences per slide). Stay visually consistent with the design direction. Resist adding slides.
