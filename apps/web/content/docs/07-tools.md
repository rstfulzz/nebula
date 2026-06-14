---
slug: tools
title: Tools
description: The Mantle limbs plus the host harness. Reads run freely; every write crosses the gates.
group: Concepts
order: 7
kicker: 'DOCS · CONCEPTS'
voice_word: gated
source: 'packages/plugin-onchain'
---

# Limbs that do, gates that decide.

Tools do literal work, never safety logic. The brain decides which tool to call; the deterministic control layer decides whether a value-moving call is allowed. Reads are free. Every write (`chain.send`, `swap.execute`, `aave.supply` / `withdraw`, `chain.wrap` / `unwrap`, `chain.write`) goes through policy, simulation, and approval first.

## On-chain tools (plugin-onchain)

| Area | Tools | Notes |
|---|---|---|
| Wallet / account | `account.info`, `account.balance` | Identity plus token snapshot plus activity; native MNT position. |
| Balances / tokens | `chain.balance`, `tokens.info` | Transfer-event discovery (no curated list). |
| Transfers | `chain.send`, `chain.wrap`, `chain.unwrap` | Native MNT and WMNT; 0x recipients. |
| Trading | `swap.best`, `swap.compare`, `swap.quote` / `swap.execute`, `moe.quote` / `moe.swap` | Agni Finance (Uniswap-V3-style) and Merchant Moe (Liquidity Book). `swap.best` quotes both and routes to the better venue. |
| Lending | `aave.markets`, `aave.position`, `aave.supply`, `aave.withdraw`, `aave.borrow`, `aave.repay` | Aave V3 full suite: live supply / borrow rates, supply / withdraw collateral, borrow / repay (variable rate); receipts report the health factor. |
| Discovery | `defi.yields` | DeFiLlama analytics: Mantle pools ranked by APY / TVL with risk and RWA flags (read-only). |
| Risk | `risk.token` | Pre-trade vet: can you exit it (live Agni / Moe quote), liquidity depth, restricted-RWA flag, real-contract check, into a low / elevated / high verdict. |
| Controls | `policy.show`, `tx.simulate` | Report the active fund-control policy; dry-run any call (would-succeed plus gas, or decoded revert) without broadcasting. |
| Analysis | `chain.tx`, `chain.contract`, `chain.activity` | Decode tx, introspect contracts, recent transfers (with optional method decode). |
| Blockchain | `chain.block`, `chain.gas` | Head, timestamp, gas price plus estimated MNT cost of common ops. |
| Generic | `chain.read`, `chain.write` | Any contract by `signature` plus `args`. |

Source: [`packages/plugin-onchain`](https://github.com/rstfulzz/nebula/tree/main/packages/plugin-onchain).

## RWA and restricted awareness

`defi.yields` surfaces every Mantle pool but flags restricted products (USDY, MI4, mUSD) so the agent only proposes entering them with explicit eligibility confirmation. DeFiLlama is used for discovery and analytics only, never execution.

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
