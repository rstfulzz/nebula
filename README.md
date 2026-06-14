<h1 align="center">Nebula</h1>

<p align="center">
  <b>A Mantle-native, policy-aware AI treasury assistant.</b><br/>
  <sub>The AI advises. Deterministic code enforces the fund controls.</sub>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <a href="https://mantle.xyz"><img src="https://img.shields.io/badge/built%20on-Mantle-blue.svg" alt="Built on Mantle"/></a>
  <img src="https://img.shields.io/badge/runtime-Bun-black.svg" alt="Bun"/>
</p>

---

Nebula is an AI agent that does real on-chain work on **Mantle** — check balances, transfer, swap, wrap, lend, and discover yield — from your **terminal**, **Telegram**, or a **web console**. What makes it more than a chatbot with a wallet is the part the AI *cannot* override: every value-moving action is checked against a deterministic policy, dry-run simulated, and (when material-risk) held for human approval before it is broadcast. The model proposes; code disposes.

> **One line:** an AI treasury operator you can actually trust with a wallet, because the spending limits, allowlists, and approval gates live in auditable code — not in a prompt the model could rationalize its way around.

## Why this design

LLMs are good at *deciding what to do* and bad at *being a safety boundary*. A jailbreak, a confused tool call, or a hallucinated "the user said it was fine" should never be the only thing standing between an agent and your treasury. So Nebula splits the two:

- **Advisory layer (the AI):** understands intent, picks tools, explains tradeoffs, discovers opportunities.
- **Control layer (deterministic code):** a pure policy engine + pre-flight simulation + an approval floor that the model has no way to bypass.

This is the defensible core — unified risk analysis, RWA-eligibility awareness, transaction simulation, enforceable policy controls, approvals, and auditable execution.

## The write pipeline

Every value-moving tool call (`chain.send`, `swap.execute`, `aave.supply`/`withdraw`, `chain.wrap`/`unwrap`, `chain.write`) goes through the same four gates:

```
        ┌───────────┐     ┌────────────┐     ┌─────────────┐     ┌──────────┐
intent →│  POLICY   │ ──▶ │  SIMULATE  │ ──▶ │  APPROVAL   │ ──▶ │ EXECUTE  │ → receipt
        │ (pure fn) │     │ (dry-run)  │     │ (if risky)  │     │ + verify │
        └───────────┘     └────────────┘     └─────────────┘     └──────────┘
         hard caps,        estimateGas /       material-risk       broadcast +
         allowlists,       simulateContract    actions prompt      wait for
         autonomy tier     aborts doomed tx    EVEN IN yolo        on-chain receipt
```

1. **Policy** (`evaluatePolicy`, pure + unit-tested): hard caps on native/token amounts, recipient + token allowlists, slippage caps, and an autonomy tier. A violation **blocks** the action; an in-cap-but-material-risk action is flagged for approval. No network, no model — fully auditable.
2. **Simulate**: the tx is dry-run (`estimateGas` / `simulateContract`) before any gas is spent; a revert aborts with a decoded reason.
3. **Approval floor**: this is the part that matters. The policy verdict sits *beneath* the session permission mode — so a material-risk action prompts for human approval **even under YOLO/auto**, and is denied outright under `strict`. Fund controls in code, not in the model.
4. **Execute**: broadcast on Mantle, wait for the receipt, return a decision record (policy verdict + sim gas + tx hash).

Configure the policy entirely from the environment (no code changes):

```bash
NEBULA_POLICY_MAX_NATIVE_MNT=2.0          # hard cap: block sends over 2 MNT
NEBULA_POLICY_AUTO_MAX_NATIVE_MNT=0.1     # auto-execute up to 0.1 MNT; above → require approval
NEBULA_POLICY_MAX_SLIPPAGE_BPS=100        # block swaps over 1% slippage
NEBULA_POLICY_AUTONOMY=auto               # auto | confirm | readonly
NEBULA_POLICY_RECIPIENT_ALLOWLIST=0xabc...,0xdef...
NEBULA_POLICY_TOKEN_ALLOWLIST=0x...,0x...
NEBULA_POLICY_READONLY=1                  # reject all writes
```

## Capabilities

| Area | Tools | Notes |
| --- | --- | --- |
| Wallet / account | `account.info`, `account.balance`, `treasury.summary` | identity + token snapshot; **`treasury.summary`** = full USD position (idle wallet + Aave deployed, priced via DeFiLlama) |
| Balances / tokens | `chain.balance`, `tokens.info` | Transfer-event discovery (no curated list) |
| Transfers | `chain.send`, `chain.wrap`, `chain.unwrap` | native MNT ↔ WMNT; 0x recipients |
| Trading | `swap.best`, `swap.compare`, `swap.quote`/`swap.execute`, `moe.quote`/`moe.swap` | **Agni Finance** (V3-style) + **Merchant Moe** (Liquidity Book). `swap.best` quotes both and routes to the better venue in one call |
| Controls | `policy.show` | report the active fund-control policy (caps, allowlists, autonomy, approval threshold) |
| Lending | `aave.position`, `aave.supply`, `aave.withdraw`, `aave.borrow`, `aave.repay` | **Aave V3** full suite — supply/withdraw collateral, borrow/repay (variable rate); receipts report the resulting health factor |
| Discovery | `defi.yields` | **DeFiLlama** analytics: Mantle pools ranked by APY/TVL with risk + RWA flags (read-only) |
| Analysis | `chain.tx`, `chain.contract`, `chain.activity` | decode tx, introspect contracts, recent transfers |
| Blockchain | `chain.block`, `chain.gas` | head, timestamp, gas price |
| Generic | `chain.read`, `chain.write` | any contract by `signature` + `args` |

Plus the host harness: shell / code execution (OS-sandboxed), file ops, web fetch + headless browser, and a persistent memory store.

**RWA / restricted awareness:** `defi.yields` surfaces every Mantle pool but flags restricted products (USDY / MI4 / mUSD) so the agent only proposes entering them with explicit eligibility confirmation. DeFiLlama is used for *discovery and analytics only* — never execution.

## Quickstart

Requires [Bun](https://bun.sh) and an OpenAI-compatible LLM key.

```bash
bun install

# Configure the brain (OpenAI-compatible; any base URL / model works)
export OPENAI_API_KEY=sk-...
# optional overrides:
# export NEBULA_LLM_BASE_URL=https://api.openai.com/v1
# export NEBULA_LLM_MODEL=gpt-4o-mini

# Create a local agent (generates an agent wallet, local encrypted keystore).
# Default identity is a plain EOA — no on-chain mint required.
bun run nebula init

# Chat in the terminal
bun run nebula chat
```

Fund the agent's EOA with a little MNT for gas, set your `NEBULA_POLICY_*` limits, and ask it to do things: *"what's my balance?"*, *"best stablecoin yield on Mantle?"*, *"swap 1 MNT for USDC"*, *"supply 5 USDC to Aave"*. Material-risk actions will pause for your approval.

**Telegram:** run `bun run nebula telegram setup` to drive the same agent (with the same approval gates, via inline-keyboard) from your phone.

## Mantle specifics

- **Mainnet** chain id `5000` · RPC `rpc.mantle.xyz` · explorer `mantlescan.xyz`
- **Sepolia testnet** chain id `5003` · RPC `rpc.sepolia.mantle.xyz` · explorer `sepolia.mantlescan.xyz`
- Gas token: **MNT**. Execution + settlement happen on Mantle; official contracts/ABIs/RPC are used for all writes.

## Architecture

A Bun + Biome monorepo:

```
packages/
  core              # brain (OpenAI-compatible), storage (SQLite, content-addressed),
                    # permission service + approval floor, plugin host, identity, memory
  plugin-onchain    # the Mantle limbs: policy engine, simulation, transfers, Agni + Merchant Moe swaps,
                    # Aave lending, DeFiLlama discovery, chain read/write/analysis
  plugin-system     # OS-sandboxed shell / code / file / web / browser tools
  plugin-telegram   # Telegram listener + inline-keyboard approvals
  gateway           # long-running daemon (keeps Telegram online, routes approvals)
  cli               # `nebula` binary (init, chat, telegram, gateway, ...)
apps/
  web               # Next.js console + docs site
```

- **Brain:** any OpenAI-compatible model (default `gpt-4o-mini`), swappable via env.
- **Storage:** local SQLite, content-addressed (`0x` + sha256 CID).
- **Stack:** [viem](https://viem.sh) for all chain I/O, [zod](https://zod.dev) tool schemas.

## Development

```bash
bun run typecheck     # tsc -b across the workspace
bun test              # unit tests (policy, simulation, approval floor, discovery, ...)
bun run lint          # biome
bun run fix           # biome autofix + format
```

The policy engine, approval floor, simulation guards, and the DeFiLlama discovery logic are all covered by deterministic unit tests (no network, injected fetch) so the safety boundary is verifiable in CI.

## License

MIT.
