---
slug: quickstart
title: Quickstart
description: Install, configure the brain, init, chat. From zero to a policy-gated agent in a few commands.
group: Get started
order: 2
kicker: 'DOCS · GET STARTED'
voice_word: live
source: 'README.md'
---

# Run your first policy-gated agent.

A few commands take you from install to a live chat. `init` creates a local agent (a fresh agent wallet plus a local encrypted keystore). The default identity is a plain EOA, so no on-chain mint is required.

## Prerequisites

[Bun](https://bun.sh). The monorepo and CLI run on Bun.

An OpenAI-compatible LLM key. The brain is any OpenAI-compatible model; the default is `gpt-4o-mini`. You can point it at any base URL and model via environment variables.

A little MNT on Mantle to pay gas for the actions you ask the agent to take.

## Install and configure

```bash
bun install

# Configure the brain (OpenAI-compatible; any base URL / model works)
export OPENAI_API_KEY=sk-...
# optional overrides:
# export NEBULA_LLM_BASE_URL=https://api.openai.com/v1
# export NEBULA_LLM_MODEL=gpt-4o-mini
```

## Init

```bash
bun run nebula init
```

`init` generates an agent wallet and writes a local encrypted keystore. The default identity is a plain EOA, so there is no on-chain mint and no operator signature required to get started.

## Set the policy

Configure the boundary entirely from the environment. These limits live in deterministic, unit-tested code; the model cannot raise them at runtime.

```bash
NEBULA_POLICY_MAX_NATIVE_MNT=2.0          # hard cap: block sends over 2 MNT
NEBULA_POLICY_AUTO_MAX_NATIVE_MNT=0.1     # auto-execute up to 0.1 MNT; above this requires approval
NEBULA_POLICY_MAX_SLIPPAGE_BPS=100        # block swaps over 1% slippage
NEBULA_POLICY_AUTONOMY=auto               # auto | confirm | readonly
NEBULA_POLICY_RECIPIENT_ALLOWLIST=0xabc...,0xdef...
NEBULA_POLICY_TOKEN_ALLOWLIST=0x...,0x...
NEBULA_POLICY_READONLY=1                  # reject all writes
```

## Chat

```bash
bun run nebula chat
```

Fund the agent's EOA with a little MNT for gas, set your `NEBULA_POLICY_*` limits, and ask it to do things: "what's my balance?", "best stablecoin yield on Mantle?", "swap 1 MNT for USDC", "supply 5 USDC to Aave". Reads run freely. Every value-moving action runs the four-gate pipeline (policy, simulate, approval, execute) before it broadcasts, and material-risk actions pause for your approval.

## Telegram

Run the same agent, with the same approval gates, from your phone:

```bash
bun run nebula telegram setup
```

Approval prompts arrive as inline-keyboard buttons.

Read [Architecture](/docs/architecture) next to understand how the pipeline fits together.

Source: [`README.md`](https://github.com/rstfulzz/nebula/blob/main/README.md).
