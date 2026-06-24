# nebula-ai-core

The SDK behind **nebula**, a Casper-native, policy-aware AI treasury agent:
the brain (OpenAI-compatible), local file-based memory + index,
the **permission service + approval floor**, Casper account identity + a local
encrypted keystore, the **on-chain registry client** (identity / reputation /
validation), the plugin host, tool registry, and event queue.

## Install

```bash
bun add nebula-ai-core
```

Bun / TypeScript-native (ships TS source). Requires [bun](https://bun.sh).

## Use

Install [`nebula-ai-agent`](https://www.npmjs.com/package/nebula-ai-agent) (the
CLI) for the full agent. This package is for plugin authors and library consumers
who want to embed the runtime, the deterministic policy/approval spine, or the
on-chain registry client (identity / reputation / validation).

See the [root README](https://github.com/rstfulzz/nebula#readme) for the full surface.
