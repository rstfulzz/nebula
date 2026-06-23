---
slug: architecture
title: Architecture
description: A Bun monorepo. An advisory brain, a deterministic control layer, and a four-gate write pipeline on Casper.
group: Concepts
order: 3
kicker: 'DOCS · CONCEPTS'
voice_word: deterministic
source: 'README.md'
---

# An advisory brain, a deterministic boundary.

Nebula splits an agent into two layers that never trade places. The advisory layer (the AI) decides what to do. The control layer (deterministic code) decides whether it is allowed to happen. Every value-moving action crosses the same four gates before it touches the chain.

```
        ┌───────────┐     ┌────────────┐     ┌─────────────┐     ┌──────────┐
intent →│  POLICY   │ ──▶ │  SIMULATE  │ ──▶ │  APPROVAL   │ ──▶ │ EXECUTE  │ → receipt
        │ (pure fn) │     │ (dry-run)  │     │ (if risky)  │     │ + verify │
        └───────────┘     └────────────┘     └─────────────┘     └──────────┘
         hard caps,        speculative-exec    material-risk       broadcast +
         allowlists,       / cost estimate     actions prompt      wait for
         autonomy tier     aborts doomed tx    EVEN IN yolo        execution result
```

## The four gates

Every value-moving tool call (`casper.send`, `casper.stake` / `casper.unstake`, swaps, generic contract writes) goes through the same pipeline:

1. **Policy** (`evaluatePolicy`, pure and unit-tested): hard caps on native CSPR and token amounts, recipient and token allowlists, slippage caps, and an autonomy tier. A violation blocks the action; an in-cap but material-risk action is flagged for approval. No network, no model, fully auditable.
2. **Simulate**: the transaction is dry-run (speculative execution / cost estimate) before any gas is spent; a failure aborts with a decoded reason.
3. **Approval floor**: the policy verdict sits beneath the session permission mode, so a material-risk action prompts for human approval even under YOLO / auto, and is denied outright under `strict`. Fund controls in code, not in the model.
4. **Execute**: broadcast on Casper, wait for the execution result, return a decision record (policy verdict plus estimated cost plus transaction hash).

## The monorepo

A Bun + Biome monorepo:

```
packages/
  core              brain (OpenAI-compatible), local file memory + index,
                    permission service + approval floor, plugin host, identity
  plugin-onchain    the Casper limbs: policy engine, simulation, native CSPR
                    transfers, CEP-18 transfers, native staking/delegation,
                    yield discovery, chain read/write/analysis
  plugin-system     OS-sandboxed shell / code / file / web / browser tools
  plugin-telegram   Telegram listener + inline-keyboard approvals
  gateway           long-running daemon (keeps Telegram online, routes approvals)
  cli               the `nebula` binary (init, chat, telegram, gateway, ...)
apps/
  web               Next.js console + docs site
contracts/          Rust/Odra registries (Identity, Reputation, Validation)
                    + a constant-product AMM, compiled to Wasm
```

## The runtime

- **Brain**: any OpenAI-compatible model (default `gpt-4o-mini`), swappable via environment variable.
- **Storage**: local files — the agent's memory notes plus an index, on the operator's machine.
- **Chain I/O**: [casper-js-sdk](https://github.com/casper-ecosystem/casper-js-sdk) (v5) for RPC reads and writes, CSPR.cloud for indexed reads and event streaming; [zod](https://zod.dev) tool schemas.
- **Surfaces**: a terminal TUI, a Telegram bridge, and the web console. A request from any surface runs the identical pipeline.

The policy engine, approval floor, simulation guards, and the yield discovery logic are covered by deterministic unit tests (no network, injected fetch), so the safety boundary is verifiable in CI.

## Casper specifics

- **Network**: Casper Testnet (`--chain-name casper-test`) for the buildathon · managed RPC `https://node.testnet.cspr.cloud/rpc` · explorer `https://testnet.cspr.live`.
- **Native token**: CSPR. 1 CSPR = 10⁹ motes; on-chain amounts are `U512`. Balances live in purses (URefs) managed by the Mint, not as intrinsic account integers.
- **Identity**: the caller is an account hash / public key (`get_caller`), not a single `address` type.
- Execution and settlement happen on Casper; the managed node RPC and CSPR.cloud indexed data are used for all reads and writes.

Read [Identity](/docs/identity) next.

Source: [`README.md`](https://github.com/rstfulzz/nebula/blob/main/README.md).
