---
slug: tools
title: Tools
description: The Casper limbs plus the host harness. Reads run freely; every write crosses the gates.
group: Concepts
order: 7
kicker: 'DOCS · CONCEPTS'
voice_word: gated
source: 'packages/plugin-onchain'
---

# Limbs that do, gates that decide.

Tools do literal work, never safety logic. The brain decides which tool to call; the deterministic control layer decides whether a value-moving call is allowed. Reads are free. Every write (`casper.send`, `casper.stake` / `casper.unstake`, and generic contract writes) goes through policy, simulation, and approval first.

## On-chain tools (plugin-onchain)

The on-chain limbs are namespaced under `casper.*`.

| Area | Tools | Notes |
|---|---|---|
| Status | `casper.status` | Network status: chain name, latest block, state root hash, node health. |
| Balances / account | `casper.balance` | Native CSPR position (in motes / CSPR) plus CEP-18 token balances for an account hash / public key. |
| Validators | `casper.validators` | Active validator set with delegation rates and APY, for picking a staking target. |
| Policy | `casper.policy` | Report the active fund-control policy (caps, allowlists, autonomy tier) — read-only. |
| Transfers | `casper.send` | Native CSPR transfer to an account hash / public key. Minimum native transfer is **2.5 CSPR**. CEP-18 token transfers (e.g. csprUSD) go the same gated path. |
| Earn | `casper.stake`, `casper.unstake` | Native delegation: stake delegates CSPR to a validator to earn staking rewards; unstake undelegates. Minimum delegation is **500 CSPR**. |

Source: [`packages/plugin-onchain`](https://github.com/rstfulzz/nebula/tree/main/packages/plugin-onchain).

## Earn is native staking

On Casper, "earn" is native staking/delegation, not lending. The agent delegates CSPR to a validator (`casper.stake`), which earns protocol staking rewards, and undelegates with `casper.unstake`. Liquid staking (CSPR → sCSPR via Wise Lending) is a second step where you want a tradable staked position. There is no supply/borrow lending venue on Casper Testnet, so the yield tools are staking-first; a tool with no live Testnet venue says so rather than pretending.

## Discovery and risk

Yield discovery reads validator APY and any live pool analytics, ranking earn options with risk signals (validator performance, delegation caps). Pre-action vetting checks a recipient or token before a write so the agent only proposes actions it can actually complete. Discovery and analytics are read-only, never execution.

## Host harness (plugin-system)

The agent also has a general-purpose toolkit for the work around the chain: OS-sandboxed shell and code execution, file operations, web fetch, and a headless browser. These run on the operator's machine under the OS sandbox.

Source: [`packages/plugin-system`](https://github.com/rstfulzz/nebula/tree/main/packages/plugin-system).

## Telegram (plugin-telegram)

A Telegram listener turns inbound DMs into agent events. Approval prompts arrive as inline-keyboard buttons, so the same boundary applies whether you drive the agent from the terminal or your phone.

Source: [`packages/plugin-telegram`](https://github.com/rstfulzz/nebula/tree/main/packages/plugin-telegram).

## Approval modes

The session permission mode controls how much the agent does without prompting, but the approval floor sits beneath it. A material-risk action prompts for a human even when the session is in `auto` / YOLO, and is denied outright under `strict` and read-only. Configure it with `NEBULA_POLICY_AUTONOMY` and the rest of the `NEBULA_POLICY_*` variables. See [Configuration](/docs/configuration).

Read [CLI](/docs/cli) next.

Source: [`packages/plugin-onchain`](https://github.com/rstfulzz/nebula/tree/main/packages/plugin-onchain).
