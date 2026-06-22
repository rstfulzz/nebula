# nebula skill pack — Casper agentic skills

A **Casper-native agentic Skills layer**: discovery, staking (earn), and swap, each as an
[OpenClaw AgentSkills](https://docs.openclaw.ai/tools/skills)-standard `SKILL.md` file, gated by
nebula's discipline: **discover → guardrail → confirm → verify on-chain.**

Built for the **Casper Agentic Buildathon** — autonomous agents doing real on-chain work on the
Casper Network, with the safety boundary in deterministic code.

## Skills

| Skill | What it does | Casper execution |
|---|---|---|
| `nebula-casper-pools` | discover validators + pool depth | `casper.validators` (+ Friendly Market reads) |
| `nebula-casper-stake` | earn by delegating CSPR | **native staking** — `casper.stake` / `casper.unstake` (min 500 CSPR) |
| `nebula-casper-swap` | policy-guarded token swap | **Friendly Market** (Testnet DEX) — CSPR/csprUSD + CEP-18 |
| `nebula-treasury-guardrail` | the deterministic reject gate | policy → approval → on-chain verification |

Execution backend = nebula's `plugin-onchain` (casper-js-sdk v5), live on Casper Testnet.

## Why staking is the earn primitive

On Casper, "earn" is **native staking/delegation**, not lending — it is a first-class protocol feature,
available on Testnet with no third-party DeFi. Liquid staking (sCSPR via Wise Lending) and lending are
roadmap; the skills never propose a venue that isn't live on the target network.

## Setup

```bash
npm install -g nebula-ai-agent
# Casper testnet env (see .env.example): CSPR_CLOUD_API_KEY, CASPER_CHAIN_NAME=casper-test,
# CASPER_NODE_RPC, CASPER_SECRET_KEY_PATH. Fund the account at testnet.cspr.live/tools/faucet.

# Install skills into your OpenClaw workspace
cp -r skills/* ~/.openclaw/workspace/skills/
openclaw skills list
```

## Safety constraints (every skill)
- A guardrail check must pass before any write — the agent advises, the rules decide.
- Every write is policy-gated, then the on-chain execution result is verified (a failed tx is never
  reported as success).
- No custody: the signer key stays local; 1 CSPR = 1e9 motes.
- Show complete public keys and tx hashes — never truncate.
