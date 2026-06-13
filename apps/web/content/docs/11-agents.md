---
slug: agents
title: For Agents
description: How AI agents (Claude Code, Codex, Cursor) install and operate Nebula for a human. What works, what to hand back, what never to claim.
group: Reference
order: 11
kicker: 'DOCS · REFERENCE'
voice_word: honest
source: 'apps/web/content/docs/11-agents.md'
---

# An honest guide for AI agents.

You are an LLM. A human asked you to set up Nebula. This page tells you what you can do for them, what you must hand back, and what you should never claim. The goal is fewer hallucinated steps and fewer hung scripts.

If you only read one line: **Bun is required, the brain is any OpenAI-compatible model (set `OPENAI_API_KEY`), and the fund-control policy lives in `NEBULA_POLICY_*` environment variables, not in the prompt.**

## Install

Nebula is a Bun + Biome monorepo. Bun runs the install and the CLI.

```bash
bun install
export OPENAI_API_KEY=sk-...
bun run nebula init
bun run nebula chat
```

`init` generates a fresh agent wallet and a local encrypted keystore. The default identity is a plain EOA, so there is no on-chain mint and no operator signature required to get started.

## What you can do for the user

- Install dependencies (`bun install`) and confirm Bun is present.
- Configure the brain: set `OPENAI_API_KEY`, optionally `NEBULA_LLM_BASE_URL` and `NEBULA_LLM_MODEL` (default `gpt-4o-mini`).
- Set the fund-control policy via `NEBULA_POLICY_*` (caps, allowlists, slippage, autonomy tier, read-only). See [Configuration](/docs/configuration).
- Explain commands. The five the user runs most: `bun run nebula init`, `bun run nebula chat`, `bun run nebula telegram setup`, plus the gateway. See [CLI](/docs/cli).
- Help them ask the agent to read or act: balances, yield discovery, transfers, Agni swaps, Aave supply/withdraw. See [Tools](/docs/tools).

## How the safety model works (so you do not fight it)

Every value-moving action runs through a four-gate pipeline: policy (pure, unit-tested), simulation (dry-run before gas), an approval floor (material-risk actions prompt a human even under YOLO), and execution (broadcast plus receipt). The model proposes; deterministic code disposes.

You cannot raise a limit, skip a simulation, or grant approval from the model. Those decisions live in code. Do not write scripts that try to route around them.

## Anti-patterns to avoid

- **Do NOT** tell the user the model can override a policy limit. It cannot. The limits are in code.
- **Do NOT** invent on-chain identity ceremonies. The default identity is a plain EOA; there is no mint, no token, no naming claim required to start.
- **Do NOT** default to mainnet for exploratory work. Use the Mantle Sepolia testnet (chain id 5003) first, then move to mainnet (chain id 5000) once the policy is set.
- **Do NOT** script destructive actions (large transfers, withdrawals) without having the user confirm. Material-risk actions will pause for approval anyway; respect that.

## Networks

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| Mantle mainnet | 5000 | `https://rpc.mantle.xyz` | `https://mantlescan.xyz` |
| Mantle Sepolia testnet | 5003 | `https://rpc.sepolia.mantle.xyz` | `https://sepolia.mantlescan.xyz` |

Gas token is MNT.

## Machine-readable surfaces

- [/llms.txt](/llms.txt): index with one bullet per doc. Fetch this first.
- [/llms-full.txt](/llms-full.txt): a single-file dump of every doc plus the repo README.
- [/docs/<slug>.md](/docs/agents.md): raw markdown per page (for example `/docs/quickstart.md`, `/docs/cli.md`).

Always re-fetch before relying on cached prior advice.
