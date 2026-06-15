# nebula-ai-plugin-system

OS + workspace tools for **nebula**: `fs.read` / `write` / `patch` / `search`,
`shell.run` / `shell.process_*`, `code.execute`, `web.fetch`, the `browser.*`
headless-browser tools, `skills.*`, `memory.read` / `save`, `delegate.task`,
`vision.analyze`, and more.

Includes the multi-tier **execution sandbox** (macOS sandbox-exec / Linux
bubblewrap / Docker) — defense-in-depth beneath the permission floor for safely
running untrusted shell + code, even when a command is granted.

## Install

Auto-installed with [`nebula-ai-agent`](https://www.npmjs.com/package/nebula-ai-agent).
Or directly: `bun add nebula-ai-plugin-system`.

See the [root README](https://github.com/rstfulzz/nebula#readme).
