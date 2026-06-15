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

**▶ Try it now:** the hosted web console at **[nebulaai.space](https://nebulaai.space)** — chat with your treasury and execute on-chain (swap, lend, transfer, wrap) straight from your connected wallet, policy-capped and simulated. Or install the CLI: `bun add -g nebula-ai-agent` (see [Quickstart](#quickstart)).

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
| Wallet / account | `account.info`, `account.balance` | identity + token snapshot (wallet + brain + recent activity, single Multicall3 round-trip) |
| Balances / tokens | `chain.balance`, `tokens.info` | Transfer-event discovery; symbol/address resolution |
| Transfers | `chain.send`, `chain.wrap`, `chain.unwrap` | native MNT ↔ WMNT; 0x recipients |
| Trading | `swap.best`, `swap.compare`, `swap.quote`/`swap.execute`, `moe.quote`/`moe.swap` | **Agni Finance** (V3-style) + **Merchant Moe** (Liquidity Book). `swap.best` quotes both and routes to the better venue |
| Controls | `policy.show` | report the active fund-control policy (caps, allowlists, autonomy, approval threshold) |
| Lending | `aave.markets`, `aave.position`, `aave.supply`, `aave.withdraw`, `aave.borrow`, `aave.repay` | **Aave V3** full suite — live supply/borrow rates per reserve, supply/withdraw collateral, borrow/repay (variable rate); receipts report the resulting health factor |
| Discovery | `defi.yields` | **DeFiLlama** analytics: Mantle pools ranked by APY/TVL with risk + RWA flags (read-only) |
| Risk | `risk.token`, `nansen.labels` | pre-trade token vet (exit / liquidity / restricted-RWA / real-contract → low/elevated/high); **Nansen** counterparty intel (exchange/fund/smart-money + red-flags: scam/hack/sanctioned/mixer) — env `NANSEN_API_KEY` |
| CEX (read-only) | `cex.balance` | **Bybit** Unified portfolio view, read-only (env keys). No CEX trading — that would bypass the on-chain safety pipeline |
| Identity (ERC-8004) | `identity.resolve`, `identity.register` | **ERC-8004 Identity Registry** — register a transferable identity NFT + agent card; resolve any agent's card / owner / operational address |
| Reputation (ERC-8004) | `reputation.give`, `reputation.show` | **ERC-8004 Reputation Registry** — record on-chain feedback (0–100 score + tag) about an agent; read its rating count + average |
| Validation (ERC-8004) | `validation.request`, `validation.respond`, `validation.show` | **ERC-8004 Validation Registry** — open a validation request anchoring an agent's output, and publish an independent validator's pass/fail verdict |
| Analysis | `chain.tx`, `chain.contract`, `chain.activity` | decode tx, introspect contracts, recent transfers |
| Blockchain | `chain.block`, `chain.gas` | head, timestamp, gas price |
| Generic | `chain.read`, `chain.write`, `tx.simulate` | any contract by `signature` + `args`; `tx.simulate` dry-runs any call (would-succeed + gas, or decoded revert) without broadcasting |

Plus the host harness: shell / code execution (OS-sandboxed), file ops, web fetch + headless browser, and a persistent memory store.

**RWA / restricted awareness:** `defi.yields` surfaces every Mantle pool but flags restricted products (USDY / MI4 / mUSD) so the agent only proposes entering them with explicit eligibility confirmation. DeFiLlama is used for *discovery and analytics only* — never execution.

### ERC-8004 (Trustless Agents)

The full 3-registry spec — **Identity + Reputation + Validation** — is implemented (self-contained contracts in `contracts/`) and **deployed live on Mantle** (mainnet + Sepolia):

| Registry | Mainnet (5000) | Sepolia (5003) |
| --- | --- | --- |
| Identity | `0x00a818451dC072d449e92a21d02d6B68fc703588` | `0x529ae7B0e8A8191c0307b918AA62f1Fc6557a621` |
| Reputation | `0x56b11a8f34eCb20899BD4E1eA539E194F007F361` | `0x0DA4162BdFaFd0b5a6Da4151E0415aEaBd87B521` |
| Validation | `0x4A222ec3D7e656ADFE28583219Bed3462973DECD` | `0x5eDa2Be8c2c24039952751C817a7E9C8E018628e` |

An agent gets a transferable ERC-721 identity whose tokenURI is its agent card; other agents record reputation feedback and request/publish validations of its output. Drive it from the CLI (`nebula identity|reputation|validation`) or as brain tools (`identity.*`, `reputation.*`, `validation.*`). Override addresses per network with `NEBULA_{IDENTITY,REPUTATION,VALIDATION}_REGISTRY`.

## Quickstart

**One-liner** — installs [bun](https://bun.sh) if needed, the `nebula` CLI, and adds it to your PATH:

```bash
curl -fsSL https://raw.githubusercontent.com/rstfulzz/nebula/main/install.sh | bash
```

Open a new terminal afterwards (the installer appends bun's bin dir to your shell rc), then `nebula` works anywhere — like `claude`.

<details>
<summary>Manual install / from source</summary>

`nebula` is bun-native. `bun add -g` drops the `nebula` command in `~/.bun/bin`, which must be on your `PATH`:

```bash
bun add -g nebula-ai-agent
export PATH="$HOME/.bun/bin:$PATH"   # add to ~/.zshrc (or ~/.bashrc) to persist
```

Or run from a clone: `bun install`, then `bun run nebula …`.
</details>

Then point the brain at an OpenAI-compatible key and bootstrap an agent:

```bash
export OPENAI_API_KEY=sk-...
# optional: export NEBULA_LLM_BASE_URL=https://api.openai.com/v1 ; export NEBULA_LLM_MODEL=gpt-4o-mini

nebula init      # generates an agent wallet + local encrypted keystore (plain EOA, no mint)
nebula           # chat in the terminal
```

Fund the agent's EOA with a little MNT for gas, set your `NEBULA_POLICY_*` limits, and ask it: *"what's my balance?"*, *"best stablecoin yield on Mantle?"*, *"swap 1 MNT for USDC"*, *"supply 5 USDC to Aave"*. Material-risk actions pause for your approval.

**Telegram:** set `TELEGRAM_BOT_TOKEN` (+ optional `TELEGRAM_CHAT_ID`) in your env, or run `nebula telegram setup` — then drive the same agent, with the same approval gates, from your phone via inline-keyboard.

## Mantle specifics

- **Mainnet** chain id `5000` · RPC `rpc.mantle.xyz` · explorer `mantlescan.xyz`
- **Sepolia testnet** chain id `5003` · RPC `rpc.sepolia.mantle.xyz` · explorer `sepolia.mantlescan.xyz`
- Gas token: **MNT**. Execution + settlement happen on Mantle; official contracts/ABIs/RPC are used for all writes.

## Architecture

A Bun + Biome monorepo:

```
packages/
  core              # brain (OpenAI-compatible), local file memory + index,
                    # permission service + approval floor, plugin host, identity
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
- **Storage:** local files — the agent's memory notes + an index, on the operator's machine.
- **Stack:** [viem](https://viem.sh) for all chain I/O, [zod](https://zod.dev) tool schemas.

## Development

```bash
bun run typecheck     # tsc -b across the workspace
bun test              # unit tests (policy, simulation, approval floor, discovery, ...)
bun run lint          # biome
bun run fix           # biome autofix + format
```

The policy engine, approval floor, simulation guards, and the DeFiLlama discovery logic are all covered by deterministic unit tests (no network, injected fetch) so the safety boundary is verifiable in CI.

For a live end-to-end check against Mantle mainnet (read a slice of every capability + the policy/simulate gates, no private key needed):

```bash
bun run smoke    # 11 checks against real Mantle RPC; Nansen/Bybit use .env keys if present
```

## License

MIT.
