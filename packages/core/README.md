# @nebula/core

Always-on infrastructure for **nebula**: runtime, brain (0G Compute), identity (iNFT), memory (0G Storage), wallet, tool registry, event queue, plugin context.

## Install

```bash
bun add @nebula/core
```

Requires [bun](https://bun.sh) ≥ 1.1.

## Use

You don't usually depend on `@nebula/core` directly. Install [`@nebula/cli`](https://www.npmjs.com/package/@nebula/cli) (the CLI) which pulls everything in. This package exists for plugin authors and library consumers who want to embed the runtime.

See the [root README](https://github.com/rstfulzz/nebula#readme) for architecture and the full surface.
