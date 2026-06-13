---
slug: identity
title: Identity
description: The agent is a plain EOA with a local encrypted keystore. No on-chain mint required to start.
group: Concepts
order: 4
kicker: 'DOCS · CONCEPTS'
voice_word: simple
source: 'README.md'
---

# A plain wallet, an enforced boundary.

The agent's identity is a plain EOA. `nebula init` generates a fresh agent wallet and writes a local encrypted keystore. There is no on-chain mint and no operator signature required to get started; the default identity is just an address that holds MNT and signs the transactions the agent is allowed to send.

## The agent wallet

The agent EOA is the address that pays gas and is the `from` of every write the agent executes. Fund it with a little MNT and the agent can transact within the limits you set. The private key is stored locally in an encrypted keystore, never sent to the model and never required to live anywhere but the operator's machine.

## What actually constrains the agent

The identity is deliberately boring. The interesting part is the boundary around it: the policy engine. What the agent can do with its wallet is decided entirely by deterministic configuration, not by the address itself.

| Control | Configured by | Effect |
|---|---|---|
| Hard caps | `NEBULA_POLICY_MAX_NATIVE_MNT`, slippage caps | Block any action over the limit. |
| Allowlists | `NEBULA_POLICY_RECIPIENT_ALLOWLIST`, `NEBULA_POLICY_TOKEN_ALLOWLIST` | Restrict recipients and tokens. |
| Autonomy tier | `NEBULA_POLICY_AUTONOMY` (`auto` / `confirm` / `readonly`) | How much the agent may do without a prompt. |
| Read-only | `NEBULA_POLICY_READONLY` | Reject all writes outright. |

These live in code and environment, so the boundary is the same whether the request arrives from the terminal, Telegram, or the web console.

## Mantle networks

- Mainnet chain id `5000`, RPC `rpc.mantle.xyz`, explorer `mantlescan.xyz`.
- Sepolia testnet chain id `5003`, RPC `rpc.sepolia.mantle.xyz`, explorer `sepolia.mantlescan.xyz`.

Start on the Sepolia testnet for exploratory work, then move to mainnet once your policy is set the way you want it.

Read [Memory](/docs/memory) next.

Source: [`README.md`](https://github.com/rstfulzz/nebula/blob/main/README.md).
