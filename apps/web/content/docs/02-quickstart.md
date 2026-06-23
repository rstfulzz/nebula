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

There are two ways in. **Try it in 30 seconds** in the browser, or **run your own agent** from the command line.

## Fastest: the hosted console (no setup)

Open the [console](/console) and start typing. Asking about balances, yields, validators, prices, or on-chain agent identities needs **no wallet, no key, no install** — the brain and the Casper connection are already wired.

Want it personal? **Connect your Casper Wallet** so "my balance / my portfolio" answers for your account, and **sign in** (one signature) to save your chat history across devices and to authorize transfers (owner-only, simulated, policy-capped). That's the whole setup. See [Console](/docs/console).

The rest of this page is for running your **own** agent — your keys, your limits, on your machine or server.

## Prerequisites (self-hosted)

[Bun](https://bun.sh). The monorepo and CLI run on Bun.

An OpenAI-compatible LLM key. The brain is any OpenAI-compatible model; the default is `gpt-4o-mini`. You can point it at any base URL and model via environment variables.

A little CSPR on Casper Testnet to pay gas for the actions you ask the agent to take. Grab some from the [testnet faucet](https://testnet.cspr.live/tools/faucet).

## Install and configure

```bash
bun install

# Configure the brain (OpenAI-compatible; any base URL / model works)
export OPENAI_API_KEY=sk-...
# Casper network + indexer:
export CSPR_CLOUD_API_KEY=...
export CASPER_CHAIN_NAME=casper-test
export CASPER_NODE_RPC=https://node.testnet.cspr.cloud/rpc
export CASPER_SECRET_KEY_PATH=/path/to/secret_key.pem
# optional brain overrides:
# export NEBULA_LLM_BASE_URL=https://api.openai.com/v1
# export NEBULA_LLM_MODEL=gpt-4o-mini
```

## Init

```bash
bun run nebula init
```

`init` generates an agent key pair and writes a local encrypted keystore. The default identity is a plain Casper account (an account hash / public key), so there is no on-chain mint and no operator signature required to get started.

## Set the policy

Configure the boundary entirely from the environment. These limits live in deterministic, unit-tested code; the model cannot raise them at runtime.

```bash
NEBULA_POLICY_MAX_NATIVE_CSPR=100         # hard cap: block sends over 100 CSPR
NEBULA_POLICY_AUTO_MAX_NATIVE_CSPR=10     # auto-execute up to 10 CSPR; above this requires approval
NEBULA_POLICY_MAX_SLIPPAGE_BPS=100        # block swaps over 1% slippage
NEBULA_POLICY_AUTONOMY=auto               # auto | confirm | readonly
NEBULA_POLICY_RECIPIENT_ALLOWLIST=account-hash-...,01abc...
NEBULA_POLICY_TOKEN_ALLOWLIST=hash-...,hash-...
NEBULA_POLICY_READONLY=1                  # reject all writes
```

## Chat

```bash
bun run nebula chat
```

Fund the agent's account with a little CSPR for gas, set your `NEBULA_POLICY_*` limits, and ask it to do things: "what's my balance?", "best validator to stake with?", "stake 500 CSPR", "send 5 CSPR to account-hash-...". Reads run freely. Every value-moving action runs the four-gate pipeline (policy, simulate, approval, execute) before it broadcasts, and material-risk actions pause for your approval.

## Telegram

Run the same agent, with the same approval gates, from your phone:

```bash
bun run nebula telegram setup
```

Approval prompts arrive as inline-keyboard buttons.

Read [Architecture](/docs/architecture) next to understand how the pipeline fits together.

Source: [`README.md`](https://github.com/rstfulzz/nebula/blob/main/README.md).
