<h1 align="center">Nebula</h1>

<p align="center">
  <b>A Casper-native, policy-aware <i>self-funding</i> agentic AI treasury.</b><br/>
  <sub>The AI advises. Deterministic Odra contracts enforce the fund controls. The agent earns its own keep.</sub>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <a href="https://casper.network"><img src="https://img.shields.io/badge/built%20on-Casper-red.svg" alt="Built on Casper"/></a>
  <img src="https://img.shields.io/badge/runtime-Bun-black.svg" alt="Bun"/>
  <a href="https://nebulaai.space/dashboard"><img src="https://img.shields.io/badge/live-dashboard-blue.svg" alt="Live dashboard"/></a>
</p>

---

Nebula is a **policy-aware agentic AI treasury + agent-trust assistant on the Casper Network**. The AI understands intent, picks tools, and explains tradeoffs — but it has no power over the money. Every value-moving action runs the same gauntlet of deterministic Odra contracts: **pre-check → policy → approval → execute → verify on-chain**. The model proposes; code disposes.

What lifts Nebula above a treasury bot that only *spends* is the **x402 self-funding loop**: Nebula also **EARNS**. It sells a metered risk signal behind an **x402 paywall**, collects real on-chain settlement, **redeems** it to native CSPR, and **compounds** it into staking — all bounded by an owner-revocable scoped treasury.

> **One line:** *an agent that funds its own operations* — and one you can actually trust with a wallet, because the spending caps, the settlement, and the kill-switch live in auditable Wasm, not in a prompt the model could rationalize its way around.

This is **not** a generic chatbot and **not** an APY-ranking bot. Built for the **Casper Agentic Buildathon**, deployed on Casper Testnet with real, on-chain, transaction-producing activity.

## The self-funding loop — proven live on Testnet

```
   buyer (holds 0 CSPR)                          NEBULA                       Casper validator
        │                                          │                                 │
   ① GET /signal ──► HTTP 402 ──► pays x402 ──► EARN  +0.5 CSPRPAY                    │
        │            (facilitator settles CSPRPAY                                     │
        │             AND pays the gas — non-custodial)                              │
        │                                          │                                 │
        │                                  ② REDEEM  500 CSPRPAY ──► 500 CSPR         │
        │                                     (PayExchange, 1:1 demo)                 │
        │                                          │                                 │
        │                                  ③ STAKE  500 CSPR ───────delegate────────►│
        │                                          ▼                                 ▼
        └──────────── risk signal served      compounds                       earns rewards
```

Three on-chain steps, each verifiable on `testnet.cspr.live`:

1. **Earn** — a buyer requests a risk signal, gets an **HTTP 402**, pays via x402; the hosted facilitator (`x402-facilitator.cspr.cloud`) submits `transfer_with_authorization` (payer → Nebula) **and pays the gas** (non-custodial), then the signal is served. A buyer holding **0 CSPR** paid 0.5 CSPRPAY; Nebula **+0.5**.
   → settle [`07747714…b05736`](https://testnet.cspr.live/transaction/07747714d43e65a98aafe9a30544a8c795eb185179d7242847a683d5b6c05736)
2. **Redeem** — 500 CSPRPAY → 500 CSPR via PayExchange.
   → [`30c0cf7b…6718a6`](https://testnet.cspr.live/transaction/30c0cf7b952e1e21c2f41c6c586fc01d03f29c87421430da65f4e9169a6718a6)
3. **Stake** — 500 CSPR delegated to validator `0106ca7c…`, compounding the earnings.
   → [`03c85b9b…50fdc5d`](https://testnet.cspr.live/transaction/03c85b9b893f0f1b2a6398bc3fbb06a55ef1cbf54598b08737fe4647f50fdc5d)

**Live dashboard (earnings · signals · stake · reputation · tx links):** [nebulaai.space/dashboard](https://nebulaai.space/dashboard)

## Why this design

LLMs are good at *deciding what to do* and bad at *being a safety boundary*. A jailbreak, a confused tool call, or a hallucinated "the user said it was fine" should never be the only thing between an agent and your treasury. So Nebula splits the two:

- **Advisory layer (the AI):** understands intent, picks tools, explains tradeoffs.
- **Control layer (deterministic code + on-chain contracts):** a pure policy engine, an approval floor, scoped on-chain delegation, and execution verification the model has no way to bypass.

### The write pipeline

Every value-moving action goes through the same gates:

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
2. **Approval floor:** the policy verdict sits *beneath* the session permission mode, so a material-risk action prompts for human approval **even under `auto`**.
3. **Execute + verify:** broadcast on Casper, then poll the on-chain execution result and check `errorMessage` — a failed transaction (which still consumes gas) is **never** reported as success.

Configure the policy entirely from the environment (no code changes):

```bash
NEBULA_POLICY_MAX_NATIVE_CSPR=2.0        # hard cap: block sends over 2 CSPR
NEBULA_POLICY_AUTO_MAX_NATIVE_CSPR=0.1   # auto-execute up to 0.1 CSPR; above → require approval
NEBULA_POLICY_AUTONOMY=auto              # auto | confirm | readonly
NEBULA_POLICY_RECIPIENT_ALLOWLIST=0203...,0189...
NEBULA_POLICY_READONLY=1                 # reject all writes
```

## Deployed contracts (Odra → Wasm, Casper Testnet)

Written in **Rust** with the **Odra** framework, compiled to Wasm, deployed via [`scripts/casper/deploy.ts`](scripts/casper/deploy.ts), and wired into `.env` as `NEBULA_*_PACKAGE_HASH`.

| Contract | Package hash | What it does |
| --- | --- | --- |
| **Treasury** | `hash-ca9367fd…e963a5` | Multi-tenant **scoped delegation**: per-user CSPR budget, per-tx + daily caps, owner-revocable kill-switch. Proven on-chain (deposit via cargo-purse session; bounded execute). |
| **PayToken / CSPRPAY** | `hash-cf8bb7a6…44ac48` | x402 settlement token (**CEP-3009**) with **on-chain EIP-712 `transfer_with_authorization`** — `verify_signature` + keccak digest, **no address recovery needed** (the public key is supplied, so it verifies directly). |
| **PayExchange** | `hash-aed6623b…d4636f` | Redeems earned CSPRPAY → native CSPR (1:1 demo exchange), closing the compound loop. |
| **IdentityRegistry** | `hash-6bdd40e1…1b65e9` | Verifiable agent **identity**. |
| **ReputationRegistry** | `hash-a4ddaf4b…e4ecb6` | On-chain agent **reputation**. |
| **ValidationRegistry** | `hash-62de1080…1aa552e` | Agent **validation** records. |
| **Token (NBL)** | `hash-7981708f…f45c517b` | CEP-18 fungible token. |
| **Amm** | `hash-5186f046…fa7938` | Abstract constant-product pool — **not** a live market. |

> Hashes are abbreviated for readability; the full 64-char values are in `.env`.

## Surfaces

Three ways to drive the same agent and the same on-chain controls:

- **CLI** (`nebula`) — a rich terminal UI agent plus the delegated-treasury tools (`casper.treasury-setup` / `-send` / `-withdraw`). Reads, native transfer, native staking, all policy-gated.
- **Web console** ([nebulaai.space](https://nebulaai.space)) — a connect-wallet agent (self-custody; client-side signing via **CSPR.click**) and the self-funding dashboard.
- **Telegram** — the gateway's shared agent (the same Casper tools, via the plugin), with inline-keyboard approvals.

## Quickstart

`nebula` is bun-native. Copy the env template, fill in a (free) CSPR.cloud key, install, and run.

```bash
cp .env.example .env            # then fill in CSPR_CLOUD_API_KEY (free at console.cspr.build)
bun install
```

Authorize writes one of two ways — a **browser wallet** (no local key) or a **local PEM**:

```bash
bun run nebula connect          # connect a CSPR.click wallet; writes are signed in the browser
# — or —
export CASPER_SECRET_KEY_PATH=/path/to/secret_key.pem   # local key, kept outside the repo
```

Fund the account on the [testnet faucet](https://testnet.cspr.live/tools/faucet), set your `NEBULA_POLICY_*` limits, and chat:

```bash
bun run nebula                  # rich terminal UI agent
```

### Run the self-funding loop

```bash
bun packages/x402/src/server.ts        # the x402 resource server (paywall the risk signal)
bun packages/x402/src/demo-client.ts   # a buyer that pays via x402 and fetches the signal
bun run scripts/casper/pay-redeem.ts   # redeem earned CSPRPAY → CSPR, then stake to compound
```

### Deploy the contracts

```bash
bun run scripts/casper/deploy.ts [ContractName ...]   # Odra → Wasm → Casper Testnet
```

## Tech

Casper **Testnet** (`casper-test` · RPC `node.testnet.cspr.cloud/rpc` · explorer `testnet.cspr.live`) · [casper-js-sdk](https://github.com/casper-ecosystem/casper-js-sdk) **v5** · **Odra** framework (Rust → Wasm) · **CSPR.cloud** RPC/REST + indexed reads · hosted **x402 facilitator** · **CEP-18 / CEP-78 / CEP-3009** token standards · **casper-eip-712** typed-data signing.

- Native token **CSPR**; **1 CSPR = 10⁹ motes**. There is no `msg.sender` — the caller is an account hash / public key; balances live in purses.
- Contract upgrades use Casper **contract-package versioning**.

## Architecture

A Bun + Biome monorepo:

```
packages/
  core              # brain (OpenAI-compatible), local file memory + index,
                    # permission service + approval floor, plugin host
  plugin-onchain    # the Casper limbs: policy engine, native transfer, staking,
                    # CEP-18 tokens, validators, balances, delegated Treasury tools;
                    # signs with a local PEM or the connected browser wallet
  plugin-system     # OS-sandboxed shell / code / file / web / browser tools
  plugin-telegram   # Telegram listener + inline-keyboard approvals
  x402              # x402 resource server: paywall + facilitator settlement +
                    # the deterministic risk signal (no LLM, no stub)
  gateway           # long-running daemon (keeps Telegram online, routes approvals)
  cli               # `nebula` binary
apps/
  web               # Next.js console + self-funding dashboard
contracts/
  src               # Odra (Rust) contracts: treasury, cep3009, exchange,
                    # identity, reputation, validation, token, amm
scripts/casper/     # deploy, pay-seed, pay-redeem, treasury-deposit, smoke tests
```

The paid capability is a real, **deterministic** address risk pre-check: given a Casper address it reads the live CSPR.cloud account balance, validator status, and recent token activity, then derives an explainable 0–100 risk score. Same input → same output, no LLM in the path.

## Honest limits

The buildathon demands honesty, so here it is:

- **AI is advisory.** All money controls (caps, allowlists, approval floor, on-chain execution verification, scoped delegation, kill-switch) are deterministic code/contracts — the model cannot bypass them.
- **PayExchange is a 1:1 demo exchange**, seeded with liquidity. No live CSPR/CSPRPAY market exists on Testnet, so we did not assume one — a real DEX venue would replace this redeem path in production.
- **The Amm is abstract** (a constant-product pool for the agent-trust demo), **not** a live trading market.
- **x402 testnet settlement quota is limited** (~25/month on testnet). We budget real settlements and let the dashboard replay the history.
- **Fee elimination is dormant** on Casper today (governance-gated) — gas *is* consumed, which is exactly why the facilitator paying it (so the buyer needs 0 CSPR) is load-bearing.

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
