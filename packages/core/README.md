# nebula-ai-core

The SDK behind **nebula**, a Mantle-native, policy-aware AI treasury assistant:
the brain (OpenAI-compatible), local SQLite memory + content-addressed storage,
the **permission service + approval floor**, plain-EOA identity + a local
encrypted keystore, the **ERC-8004 (Trustless Agents) identity client**, the
plugin host, tool registry, and event queue.

## Install

```bash
bun add nebula-ai-core
```

Bun / TypeScript-native (ships TS source). Requires [bun](https://bun.sh).

## Use

Install [`nebula-ai-agent`](https://www.npmjs.com/package/nebula-ai-agent) (the
CLI) for the full agent. This package is for plugin authors and library consumers
who want to embed the runtime, the deterministic policy/approval spine, or the
ERC-8004 identity client (`registerAgent`, `resolveAgentById`, `buildAgentCard`).

See the [root README](https://github.com/rstfulzz/nebula#readme) for the full surface.
