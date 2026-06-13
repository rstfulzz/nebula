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

The brain and the entire fund-control policy are configured from environment variables. No code changes are needed to change a limit, and nothing the model outputs can override them, because the policy is enforced in deterministic, unit-tested code.

## Brain

```bash
export OPENAI_API_KEY=sk-...
# optional overrides:
export NEBULA_LLM_BASE_URL=https://api.openai.com/v1   # any OpenAI-compatible endpoint
export NEBULA_LLM_MODEL=gpt-4o-mini                    # default model
```

Any OpenAI-compatible model works. Swapping the model has no effect on the safety boundary.

## Policy

```bash
NEBULA_POLICY_MAX_NATIVE_MNT=2.0          # hard cap: block sends over 2 MNT
NEBULA_POLICY_AUTO_MAX_NATIVE_MNT=0.1     # auto-execute up to 0.1 MNT; above this requires approval
NEBULA_POLICY_MAX_SLIPPAGE_BPS=100        # block swaps over 1% slippage
NEBULA_POLICY_AUTONOMY=auto               # auto | confirm | readonly
NEBULA_POLICY_RECIPIENT_ALLOWLIST=0xabc...,0xdef...
NEBULA_POLICY_TOKEN_ALLOWLIST=0x...,0x...
NEBULA_POLICY_READONLY=1                  # reject all writes
```

| Variable | Controls |
|---|---|
| `NEBULA_POLICY_MAX_NATIVE_MNT` | Hard cap on native MNT per action. A value above this blocks. |
| `NEBULA_POLICY_AUTO_MAX_NATIVE_MNT` | The amount the agent may move without prompting. Above it, approval is required. |
| `NEBULA_POLICY_MAX_SLIPPAGE_BPS` | Maximum allowed swap slippage, in basis points. |
| `NEBULA_POLICY_AUTONOMY` | `auto` (act within tier), `confirm` (prompt on writes), `readonly` (no writes). |
| `NEBULA_POLICY_RECIPIENT_ALLOWLIST` | Comma-separated recipient addresses the agent may send to. |
| `NEBULA_POLICY_TOKEN_ALLOWLIST` | Comma-separated token addresses the agent may touch. |
| `NEBULA_POLICY_READONLY` | When set, all writes are rejected outright. |

The approval floor sits beneath the autonomy tier: a material-risk action prompts for a human even under `auto` / YOLO, and is denied under `readonly` / strict.

## Networks

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| Mantle mainnet | 5000 | `https://rpc.mantle.xyz` | `https://mantlescan.xyz` |
| Mantle Sepolia testnet | 5003 | `https://rpc.sepolia.mantle.xyz` | `https://sepolia.mantlescan.xyz` |

Gas token is MNT. Start on the Sepolia testnet for exploratory work, then move to mainnet once your policy is set.

Read [Console](/docs/console) next.

Source: [`README.md`](https://github.com/rstfulzz/nebula/blob/main/README.md).
