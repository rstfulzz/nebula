# @nebula/harness

Sandbox-resident harness daemon for **nebula**. Runs inside the Mantle Sandbox TDX TEE, exposes an HTTP control plane (`/chat`, `/events`, `/sync`, `/approval`), bootstraps a keypair, and accepts the agent privkey via Option 3 ECIES handoff from the laptop CLI.

## Install

```bash
bun add @nebula/harness
```

Requires [bun](https://bun.sh) ≥ 1.1.

## Use

You don't run this directly on a laptop. It's bootstrapped automatically by `nebula deploy` (Local→Sandbox migration) and `nebula upgrade`. Documented for transparency; consumed by `@nebula/cli` (the CLI).

See the [root README](https://github.com/rstfulzz/nebula#readme) for the full sandbox architecture.
