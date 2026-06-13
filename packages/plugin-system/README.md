# @nebula/plugin-system

System tools plugin for **nebula**: `fs.read`, `fs.write`, `fs.patch`, `fs.search`, `shell.run`, `shell.cd`, `shell.process_*`, `code.execute`, `web.fetch`, 10 `browser.*` tools (via agent-browser CLI), `skills.list`, `skills.view`, `skills.manage`, `session.search`, `delegate.task`, `vision.analyze`, `tool.search`, `memory.read`, `memory.save`, `clarify`, `todo`.

Includes the multi-tier sandbox layer (macOS sandbox-exec, Linux bubblewrap, Docker) for safely executing untrusted shell + code.

## Install

Auto-installed when you `bun add -g @nebula/cli`. Or directly: `bun add @nebula/plugin-system`.

Requires [bun](https://bun.sh) ≥ 1.1.

See the [root README](https://github.com/rstfulzz/nebula#readme) for the full tool surface and sandbox config.
