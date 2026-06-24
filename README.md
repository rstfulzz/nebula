<h1 align="center">Nebula</h1>

<p align="center">
  <b>A Casper-native, policy-aware AI treasury assistant.</b><br/>
  <sub>The AI advises. Deterministic code enforces the fund controls.</sub>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <a href="https://casper.network"><img src="https://img.shields.io/badge/built%20on-Casper-red.svg" alt="Built on Casper"/></a>
  <img src="https://img.shields.io/badge/runtime-Bun-black.svg" alt="Bun"/>
</p>

---

Nebula is an AI agent that does real on-chain work on the **Casper Network** — check balances, transfer CSPR, and stake to earn — from your **terminal**. What makes it more than a chatbot with a wallet is the part the AI *cannot* override: every value-moving action is checked against a deterministic policy, then **executed and verified on-chain** before it is reported as success. The model proposes; code disposes.

> **One line:** an AI treasury operator you can actually trust with a wallet, because the spending caps, allowlists, and approval gates live in auditable code — not in a prompt the model could rationalize its way around.

Built for the **Casper Agentic Buildathon** — agentic AI at the intersection of DeFi and RWA, deployed on Casper Testnet with real transaction-producing on-chain activity.

## Why this design

LLMs are good at *deciding what to do* and bad at *being a safety boundary*. A jailbreak, a confused tool call, or a hallucinated "the user said it was fine" should never be the only thing between an agent and your treasury. So Nebula splits the two:

- **Advisory layer (the AI):** understands intent, picks tools, explains tradeoffs.
- **Control layer (deterministic code):** a pure policy engine + an approval floor + on-chain execution verification that the model has no way to bypass.

## The write pipeline

Every value-moving tool call (`casper.send`, `casper.stake`, `casper.unstake`) goes through the same gates:

```
        ┌───────────┐     ┌─────────────┐     ┌──────────────────┐
intent →│  POLICY   │ ──▶ │  APPROVAL   │ ──▶ │ EXECUTE + VERIFY │ → receipt
        │ (pure fn) │     │ (if risky)  │     │  (on-chain)      │
        └───────────┘     └─────────────┘     └──────────────────┘
         hard caps,        material-risk        broadcast, then
         allowlists,       actions prompt       confirm execution
         autonomy tier     EVEN under auto       (errorMessage check)
```

1. **Policy** (`evaluatePolicy`, pure + unit-tested): hard caps on native CSPR (motes), recipient + token allowlists, and an autonomy tier. A violation **blocks**; an in-cap-but-material-risk action is flagged for approval. No network, no model — fully auditable.
2. **Approval floor:** the policy verdict sits *beneath* the session permission mode, so a material-risk action prompts for human approval **even under auto**.
3. **Execute + verify:** broadcast on Casper, then poll the on-chain execution result and check `errorMessage` — a failed transaction (which still consumes gas) is **never** reported as success.

Configure the policy entirely from the environment (no code changes):

```bash
NEBULA_POLICY_MAX_NATIVE_CSPR=100         # hard cap: block sends over 100 CSPR
NEBULA_POLICY_AUTO_MAX_NATIVE_CSPR=5      # auto-execute up to 5 CSPR; above → require approval
NEBULA_POLICY_AUTONOMY=auto               # auto | confirm | readonly
NEBULA_POLICY_RECIPIENT_ALLOWLIST=0203...,0189...
NEBULA_POLICY_READONLY=1                  # reject all writes
```

## Capabilities

Live and verified on Casper **Testnet** (casper-js-sdk v5):

| Area | Tools | Notes |
| --- | --- | --- |
| Status / reads | `casper.status`, `casper.balance`, `casper.validators` | node + network status, main-purse balance, validator set |
| Transfers | `casper.send` | native CSPR transfer (min 2.5), policy-gated + on-chain verified |
| Earn (staking) | `casper.stake`, `casper.unstake` | native delegation to a validator — the Casper earn primitive (min 500 CSPR) |
| Controls | `casper.policy` | report the active fund-control policy (caps, allowlists, autonomy) |

Plus the host harness: shell / code execution (OS-sandboxed), file ops, web fetch + headless browser, and a persistent memory store.

### Roadmap

- **CEP-18 transfers** — `csprUSD` (the US-registered stablecoin live on Casper Testnet) and other tokens.
- **Swap** — integrate **Friendly Market** (the Uniswap-V2-style DEX live on Casper Testnet); CSPR.trade for quotes.
- **Liquid staking** — `sCSPR` via Wise Lending.
- **Agent-trust registries** — Identity / Reputation / Validation, ported to **Odra** (Rust → Wasm) on Casper.
- **x402 micropayments** + **Casper MCP** for agent-to-service payments and state access.
- **Web console + Telegram** surfaces.

## Quickstart

`nebula` is bun-native — install it globally, or run from this repo with `bun install`.

```bash
bun add -g nebula-ai-agent     # global `nebula`   (or: bun install, then bun run nebula)
```

**No keys required to start.** With no LLM key set, the brain falls back to a hosted, rate-limited proxy — set your own only to lift the cap. You do need a (free) CSPR.cloud key for chain reads:

```bash
export CSPR_CLOUD_API_KEY=...                 # free at console.cspr.build
# optional:
export OPENAI_API_KEY=sk-...                  # your own LLM key (else the hosted proxy)
export CASPER_CHAIN_NAME=casper-test          # default
export CASPER_NODE_RPC=https://node.testnet.cspr.cloud/rpc   # default
```

Authorize writes one of two ways — a **browser wallet** (no local key) or a **local PEM**:

```bash
nebula connect                                # connect a CSPR.click wallet; writes are signed in the browser
# — or —
export CASPER_SECRET_KEY_PATH=/path/to/secret_key.pem   # local key, kept outside the repo
```

Fund the account on the [testnet faucet](https://testnet.cspr.live/tools/faucet), set your `NEBULA_POLICY_*` limits, and chat:

```bash
nebula                  # rich terminal UI (use `--plain` for a basic REPL)
```

It drives the tools exactly as policy allows: live reads, a deterministic policy **block**, an approval gate, and real, on-chain-verified CSPR transfers / staking / CEP-18 token sends on testnet. For a scripted walkthrough of the loop: `bun run packages/plugin-onchain/src/demo.ts`.

## Casper specifics

- **Testnet** chain name `casper-test` · RPC `node.testnet.cspr.cloud/rpc` · explorer `testnet.cspr.live`
- Native token **CSPR**; **1 CSPR = 10⁹ motes**. There is no `msg.sender` — the caller is an account hash / public key; balances live in purses.
- Contracts (roadmap) are written in **Rust** with the **Odra** framework and deployed as Wasm.

## Architecture

A Bun + Biome monorepo:

```
packages/
  core              # brain (OpenAI-compatible), local file memory + index,
                    # permission service + approval floor, plugin host
  plugin-onchain    # the Casper limbs: policy engine, native transfer,
                    # staking, CEP-18 tokens, validators, balances; signs
                    # with a local PEM or the connected browser wallet
  plugin-system     # OS-sandboxed shell / code / file / web / browser tools
  plugin-telegram   # Telegram listener + inline-keyboard approvals
  gateway           # long-running daemon (keeps Telegram online, routes approvals)
  cli               # `nebula` binary
apps/
  web               # Next.js console + docs site
```

- **Brain:** any OpenAI-compatible model (default `gpt-4o-mini`), swappable via env.
- **Storage:** local files — the agent's memory + index, on the operator's machine.
- **Stack:** [casper-js-sdk](https://github.com/casper-ecosystem/casper-js-sdk) v5 for chain I/O, [zod](https://zod.dev) tool schemas.

## Development

```bash
bun run typecheck     # tsc -b across the workspace
bun test              # unit tests (policy engine, motes, tool gating)
bun run lint          # biome
bun run fix           # biome autofix + format
```

The policy engine, approval gate, and motes math are covered by deterministic unit tests (no network) so the safety boundary is verifiable in CI.

## License

MIT.
