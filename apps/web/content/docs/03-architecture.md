---
slug: architecture
title: Architecture
description: A Bun monorepo. An advisory brain, a deterministic control layer, and a four-gate write pipeline on Mantle.
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
         hard caps,        estimateGas /       material-risk       broadcast +
         allowlists,       simulateContract    actions prompt      wait for
         autonomy tier     aborts doomed tx    EVEN IN yolo        on-chain receipt
```

## The four gates

Every value-moving tool call (`chain.send`, `swap.execute`, `aave.supply` / `withdraw`, `chain.wrap` / `unwrap`, `chain.write`) goes through the same pipeline:

1. **Policy** (`evaluatePolicy`, pure and unit-tested): hard caps on native and token amounts, recipient and token allowlists, slippage caps, and an autonomy tier. A violation blocks the action; an in-cap but material-risk action is flagged for approval. No network, no model, fully auditable.
2. **Simulate**: the transaction is dry-run with `estimateGas` / `simulateContract` before any gas is spent; a revert aborts with a decoded reason.
3. **Approval floor**: the policy verdict sits beneath the session permission mode, so a material-risk action prompts for human approval even under YOLO / auto, and is denied outright under `strict`. Fund controls in code, not in the model.
4. **Execute**: broadcast on Mantle, wait for the receipt, return a decision record (policy verdict plus simulated gas plus tx hash).

## The monorepo

A Bun + Biome monorepo:

```
packages/
  core              brain (OpenAI-compatible), storage (SQLite, content-addressed),
                    permission service + approval floor, plugin host, identity, memory
  plugin-onchain    the Mantle limbs: policy engine, simulation, transfers, Agni swaps,
                    Aave lending, DeFiLlama discovery, chain read/write/analysis
  plugin-system     OS-sandboxed shell / code / file / web / browser tools
  plugin-telegram   Telegram listener + inline-keyboard approvals
  gateway           long-running daemon (keeps Telegram online, routes approvals)
  cli               the `nebula` binary (init, chat, telegram, gateway, ...)
apps/
  web               Next.js console + docs site
```

## The runtime

- **Brain**: any OpenAI-compatible model (default `gpt-4o-mini`), swappable via environment variable.
- **Storage**: local SQLite, content-addressed (`0x` plus sha256 CID).
- **Chain I/O**: [viem](https://viem.sh) for every read and write; [zod](https://zod.dev) tool schemas.
- **Surfaces**: a terminal TUI, a Telegram bridge, and the web console. A request from any surface runs the identical pipeline.

The policy engine, approval floor, simulation guards, and the DeFiLlama discovery logic are covered by deterministic unit tests (no network, injected fetch), so the safety boundary is verifiable in CI.

## Mantle specifics

- **Mainnet** chain id `5000` · RPC `rpc.mantle.xyz` · explorer `mantlescan.xyz`
- **Sepolia testnet** chain id `5003` · RPC `rpc.sepolia.mantle.xyz` · explorer `sepolia.mantlescan.xyz`
- Gas token: MNT. Execution and settlement happen on Mantle; official contracts, ABIs, and RPC data are used for all writes.

Read [Identity](/docs/identity) next.

Source: [`README.md`](https://github.com/rstfulzz/nebula/blob/main/README.md).
