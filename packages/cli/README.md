# @nebula/cli

CLI binary for **nebula**: the first fully on-chain sovereign agent harness on Mantle.

## Install

```bash
bun add -g @nebula/cli
nebula init
```

Requires [bun](https://bun.sh) ≥ 1.1.

## Commands

`nebula init` boots the wizard (mints an iNFT, opens a Mantle Compute ledger, generates the agent EOA). After that: `nebula` for chat, `nebula status`, `nebula logs`, `nebula topup`, `nebula ledger`, `nebula drain`, `nebula sync`, `nebula inspect`, `nebula deploy`, `nebula upgrade`, `nebula help` for the full list.

See the [root README](https://github.com/rstfulzz/nebula#readme) for architecture, concepts, and the full command reference.
