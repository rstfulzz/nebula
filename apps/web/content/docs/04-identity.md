---
slug: identity
title: Identity
description: The agent is a plain Casper account with a local encrypted keystore. No on-chain mint required to start.
group: Concepts
order: 4
kicker: 'DOCS · CONCEPTS'
voice_word: simple
source: 'README.md'
---

# A plain wallet, an enforced boundary.

The agent's identity is a plain Casper account. `nebula init` generates a fresh agent key pair and writes a local encrypted keystore. There is no on-chain mint and no operator signature required to get started; the default identity is just an account hash / public key that holds CSPR and signs the transactions the agent is allowed to send.

## The agent wallet

The agent account is the identity that pays gas and initiates every write the agent executes. Fund its main purse with a little CSPR and the agent can transact within the limits you set. The secret key is stored locally in an encrypted keystore, never sent to the model and never required to live anywhere but the operator's machine.

## What actually constrains the agent

The identity is deliberately boring. The interesting part is the boundary around it: the policy engine. What the agent can do with its wallet is decided entirely by deterministic configuration, not by the account itself.

| Control | Configured by | Effect |
|---|---|---|
| Hard caps | `NEBULA_POLICY_MAX_NATIVE_CSPR`, slippage caps | Block any action over the limit. |
| Allowlists | `NEBULA_POLICY_RECIPIENT_ALLOWLIST`, `NEBULA_POLICY_TOKEN_ALLOWLIST` | Restrict recipients and tokens. |
| Autonomy tier | `NEBULA_POLICY_AUTONOMY` (`auto` / `confirm` / `readonly`) | How much the agent may do without a prompt. |
| Read-only | `NEBULA_POLICY_READONLY` | Reject all writes outright. |

These live in code and environment, so the boundary is the same whether the request arrives from the terminal, Telegram, or the web console.

For tighter on-chain control, Casper offers native associated keys with weights and action thresholds, so an owner can bound or revoke the agent's authority at the account level without any extra Safe-style contract. The agent's keyless execution stays owner-revocable.

## Casper network

- Testnet `--chain-name casper-test`, managed RPC `https://node.testnet.cspr.cloud/rpc`, explorer `https://testnet.cspr.live`.
- Native token CSPR (1 CSPR = 10⁹ motes); balances live in purses managed by the Mint.

Start on Testnet for exploratory work, then move to mainnet once your policy is set the way you want it.

Read [Memory](/docs/memory) next.

Source: [`README.md`](https://github.com/rstfulzz/nebula/blob/main/README.md).
