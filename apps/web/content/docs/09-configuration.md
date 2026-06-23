---
slug: configuration
title: Configuration
description: Configure the brain and the fund-control policy entirely from the environment. No code changes.
group: Reference
order: 9
kicker: 'DOCS · REFERENCE'
voice_word: typed
source: 'README.md'
---

# Configured from the environment.

The brain, the Casper connection, and the entire fund-control policy are configured from environment variables. No code changes are needed to change a limit, and nothing the model outputs can override them, because the policy is enforced in deterministic, unit-tested code.

## Brain

```bash
export OPENAI_API_KEY=sk-...
# optional overrides:
export NEBULA_LLM_BASE_URL=https://api.openai.com/v1   # any OpenAI-compatible endpoint
export NEBULA_LLM_MODEL=gpt-4o-mini                    # default model
```

Any OpenAI-compatible model works. Swapping the model has no effect on the safety boundary.

## Casper connection

```bash
export CSPR_CLOUD_API_KEY=...                            # CSPR.cloud token (indexed reads + streaming)
export CASPER_CHAIN_NAME=casper-test                    # network name (casper-test | casper)
export CASPER_NODE_RPC=https://node.testnet.cspr.cloud/rpc
export CASPER_SECRET_KEY_PATH=/path/to/secret_key.pem   # agent signing key (PEM)
```

## Policy

```bash
NEBULA_POLICY_MAX_NATIVE_CSPR=100         # hard cap: block sends over 100 CSPR
NEBULA_POLICY_AUTO_MAX_NATIVE_CSPR=10     # auto-execute up to 10 CSPR; above this requires approval
NEBULA_POLICY_MAX_SLIPPAGE_BPS=100        # block swaps over 1% slippage
NEBULA_POLICY_AUTONOMY=auto               # auto | confirm | readonly
NEBULA_POLICY_RECIPIENT_ALLOWLIST=account-hash-...,01abc...
NEBULA_POLICY_TOKEN_ALLOWLIST=hash-...,hash-...
NEBULA_POLICY_READONLY=1                  # reject all writes
```

| Variable | Controls |
|---|---|
| `NEBULA_POLICY_MAX_NATIVE_CSPR` | Hard cap on native CSPR per action. A value above this blocks. |
| `NEBULA_POLICY_AUTO_MAX_NATIVE_CSPR` | The amount the agent may move without prompting. Above it, approval is required. |
| `NEBULA_POLICY_MAX_SLIPPAGE_BPS` | Maximum allowed swap slippage, in basis points. |
| `NEBULA_POLICY_AUTONOMY` | `auto` (act within tier), `confirm` (prompt on writes), `readonly` (no writes). |
| `NEBULA_POLICY_RECIPIENT_ALLOWLIST` | Comma-separated recipient account hashes / public keys the agent may send to. |
| `NEBULA_POLICY_TOKEN_ALLOWLIST` | Comma-separated CEP-18 token (contract / package) hashes the agent may touch. |
| `NEBULA_POLICY_READONLY` | When set, all writes are rejected outright. |

The approval floor sits beneath the autonomy tier: a material-risk action prompts for a human even under `auto` / YOLO, and is denied under `readonly` / strict.

## Networks

| Network | Chain name | RPC | Explorer |
|---|---|---|---|
| Casper mainnet | `casper` | `https://node.cspr.cloud/rpc` | `https://cspr.live` |
| Casper Testnet | `casper-test` | `https://node.testnet.cspr.cloud/rpc` | `https://testnet.cspr.live` |

Native token is CSPR (1 CSPR = 10⁹ motes). Start on Testnet for exploratory work, then move to mainnet once your policy is set.

Read [Console](/docs/console) next.

Source: [`README.md`](https://github.com/rstfulzz/nebula/blob/main/README.md).
