# nebula — pitch deck

> Verifiable autonomy for on-chain treasuries, on Mantle.
> The AI advises. Deterministic code enforces. Identity is provable on-chain.

Mantle Turing Test 2026 · theme: **verifiable autonomy**
Every claim here is backed by shipped code — see `submission/CLAIMS.md` for file-level evidence.

---

## 1 · Title

**nebula**
A policy-aware AI treasury agent on Mantle.
Live: **nebulaai.space** · npm: `nebula-ai-agent` · open source.

---

## 2 · Problem

AI agents and money are stuck between two bad options:

- **Toothless chatbots** — they can *talk* about DeFi but can’t act, so they’re demos.
- **Reckless key-holders** — they hold a private key and can do *anything*, so no one sane points one at a treasury.

The missing piece isn’t a smarter model. It’s **trust you can verify** — a way to give an agent real capability without giving it the keys to ruin you.

---

## 3 · Insight

Separate **advice** from **authority**.

- The model only ever proposes **typed intents** and explains itself. It never holds keys.
- **Deterministic code and contracts** decide what is actually allowed.
- The agent’s **identity and track record live on-chain** (ERC-8004), so trust is checked, not claimed.

A wrong — or jailbroken — model still cannot breach a limit. That’s verifiable autonomy.

---

## 4 · Solution — the four-gate write pipeline

Every value-moving action passes four deterministic gates before it can broadcast:

```
intent → 1. POLICY → 2. SIMULATE → 3. APPROVE → 4. EXECUTE → receipt
          allowlists    dry-run vs    human sign   client-
          + caps        live state    for material  signed
          + slippage    (revert?      risk          (your
          + RWA         drift?)                      wallet)
```

The AI sits *before* gate 1. The gates are pure, unit-tested code — `packages/plugin-onchain/src/policy.ts`, `simulate.ts`.

---

## 5 · Why it fits the theme — verifiable autonomy

- **On-chain identity (ERC-8004 Trustless Agents)** — Identity, Reputation, and Validation registries, deployed on **Mantle mainnet** (and Sepolia). An agent’s identity and feedback are auditable by anyone.
- **Deterministic guardrails** — policy is code, not a prompt. Caps, allowlists, slippage floors, RWA eligibility.
- **No custody** — keys never leave the user; the server only *prepares* policy-checked actions, the wallet signs.

Autonomy you can point at money because you can verify what it can and can’t do.

---

## 6 · What it actually does (all shipped)

**Reads & risk**
- Portfolio & balances on Mantle
- **DeFiLlama** yields — and it flags restricted RWAs (USDY / MI4 / mUSD)
- **Nansen** address risk labels (exchange / fund / smart-money / red-flags)
- **Bybit** CEX balance (read-only)

**Execution (policy-gated, simulated, signed by you)**
- Native MNT transfer · ERC-20 transfer · wrap / unwrap MNT
- Swaps — **Agni V3 + Merchant Moe** (CLI routes the better pool); **OpenOcean** aggregator in the web console
- **Aave V3** on Mantle — supply / withdraw / borrow / repay, with health-factor tracking (mainnet)

---

## 7 · Architecture

```
 Surfaces        Brain (advisory)      Deterministic spine        Chain
 ─────────       ────────────────      ───────────────────        ─────
 Web console  ┐                      ┌ policy engine  ┐
 CLI          ├─► OpenAI-compatible ─┤ simulation     ├─► sign ──► Mantle
 Telegram     │   tool-calling loop  │ approval floor │   (client    (5000)
 Gateway      ┘   (no keys)          └ ERC-8004 id    ┘    wallet)
```

- **core** (`nebula-ai-core`) — brain, memory, permission/approval, keystore, ERC-8004 client, plugin host
- **plugin-onchain** — the tools + policy + simulation
- **gateway** — always-on daemon (Telegram, approvals, heartbeat); runs where the user controls it
- **apps/web** — Next.js console; embeds the agent server-side, key-less, client-signed

---

## 8 · Safety is the moat

- **No custody.** No server-side key for the public console.
- **Derived agent wallet** — `keccak256(signature)`, byte-identical in web and CLI, so the same operator gets the same agent wallet everywhere.
- **Policy caps** — `NEBULA_POLICY_MAX_NATIVE_MNT`, slippage bps, token/recipient allowlists, read-only mode.
- **Bounded autonomy** — auto inside a pre-authorized envelope; everything material escalates to a human.

---

## 9 · It’s real, not slideware

- **Live**: nebulaai.space (console, docs, pricing, status, safety).
- **Published**: 6 npm packages @ 0.3.x (`nebula-ai-core`, `nebula-ai-agent`, plugins, gateway).
- **On-chain**: ERC-8004 registries on Mantle mainnet **and** Sepolia (addresses in README + CLAIMS.md).
- **Open source**: github.com/rstfulzz/nebula.

---

## 10 · Ecosystem fit (Mantle + sponsors)

| Partner | Role in nebula |
|---|---|
| **Mantle** | Execution & settlement (chainId 5000), MNT |
| **Merchant Moe + Agni** | DEX routing for swaps |
| **Aave V3** | Lending — supply / borrow / withdraw / repay |
| **Nansen** | On-chain address risk labels |
| **DeFiLlama** | Yield discovery + restricted-asset flags |
| **Bybit** | CEX balance (read-only) |

---

## 11 · Business model

Three pricing surfaces (live at /pricing):

- **Individual** — Free → Plus $19 → Pro $49. Bring your own LLM key; agent wallet; autonomy.
- **Team / DAO** — $39/seat, multisig policy, SSO, audit log. Managed/Enterprise for funds (AUM + perf fee).
- **API & SDK** — free open-source SDK + usage-based hosted API.

Cross-subsidy: a small **execution fee** on routed swaps (tiered down by plan) monetizes even free users — the lever pure chatbots don’t have.

---

## 12 · Roadmap

- Hosted, isolated **gateway autonomy** (the 24/7 product) with server-side key isolation
- Richer deterministic policy (per-token / per-day caps, multisig approval flows)
- **Security audit** before real treasury funds at scale
- Managed treasury, on an ERC-8004-verifiable track record

---

## 13 · Ask / close

nebula is the answer to the only question that matters for agentic finance:
**“how do I let it act without letting it wreck me?”**

The AI advises. Code enforces. Identity is on-chain.
**Verifiable autonomy — live on Mantle today.**
