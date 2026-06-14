# nebula-ai-gateway

The always-on **gateway daemon** for **nebula**. Keeps the agent online when the
TUI is closed: runs the Telegram listener, routes inline-keyboard approvals, and
serves a local control plane. Runs locally on your machine (no remote sandbox);
started with `nebula gateway start`.

## Install

```bash
bun add nebula-ai-gateway
```

Requires [bun](https://bun.sh).

## Use

You don't usually run this directly — `nebula gateway start` (from
[`nebula-treasury`](https://www.npmjs.com/package/nebula-treasury)) spawns it with
Touch ID + a cached operator session, decrypts the local keystore, and brings the
listeners online. Documented here for transparency.

See the [root README](https://github.com/rstfulzz/nebula#readme).
