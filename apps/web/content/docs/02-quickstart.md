---
slug: quickstart
title: Quickstart
description: Install, init, chat. From zero to a live agent in three commands.
group: Get started
order: 2
kicker: 'DOCS · GET STARTED'
voice_word: live
source: 'packages/cli/src/commands/init.ts'
---

# Run your first live agent.

Three commands. The `init` wizard does the on-chain work in the background. By the end your agent has an iNFT, a wallet, a brain envelope, an encrypted memory partition, and a `.nebula.0g` subname.

## Prerequisites

[bun](https://bun.sh) version 1.1 or newer. The CLI shebangs `bun` directly and preloads `@opentui/solid/preload` to run `.tsx` files without a build step. npm install works for putting the binary on PATH but the binary will exit if bun is missing.

A funded Mantle operator wallet. The init wizard shows a live cost summary before the wallet signs anything; the breakdown comes from `packages/cli/src/commands/init/cost.ts`. Order of magnitude:

- `mint + setApprovalForAll`: about 0.01 Mantle of gas.
- storage upload of the keystore: about 0.005 Mantle of gas.
- agent infra float: 0.1 Mantle. Funds the agent EOA; the agent pays its own subname claim (about 0.03 Mantle) from this.
- compute ledger deposit: 3, 10, or 30 Mantle depending on the tier you pick in step 5.

So a Starter (3 Mantle ledger) mint costs the operator around 3.12 Mantle total. Standard (10 Mantle ledger) is around 10.12 Mantle. Extended (30 Mantle ledger) is around 30.12 Mantle. Testnet (Galileo) is free from the faucet.

## Install

```
bun add -g @nebula/cli
```

That installs the CLI binary as `nebula` on your PATH and pulls every workspace package (`@nebula/core`, `nebula-plugin-onchain`, `nebula-plugin-comms`, `nebula-plugin-system`, `nebula-plugin-telegram`, `nebula-gateway`) as transitive deps.

## Init

```
nebula init
```

The wizard runs in four phases. Phase A asks six questions locally. Phase B gates on the operator wallet. Phase C executes the on-chain work. Phase D writes config.

**Phase A. Local prompts.**

1. Pick network. Mainnet (`mantle-mainnet`, chainId 16661) or testnet (`mantle-testnet`, chainId 16602).
2. Pick where the agent runs. Two choices.
   - **Local** (default). The harness runs on this machine while the CLI is open, plus a standalone gateway daemon at `~/.nebula/agents/<id>/gateway.sock` for ambient triggers (Telegram, A2A) when the TUI is closed. No extra cost beyond the operator spend in step 5.
   - **Mantle Sandbox.** The harness runs in a TDX TEE container on Mantle Sandbox. Persistent across laptop closures. Today the Sandbox is Galileo testnet only, so this is a hybrid path: identity, wallet, Storage, and Compute live on whichever main network you picked in step 1, the container lives on Galileo testnet. Mainnet sandbox launches when Mantle ships it; the CLI will switch automatically. Sandbox adds three cost components on top of the mainnet operator spend.
     1. **Initial provider deposit.** About 1 Mantle testnet, sent to the Galileo `SandboxBilling` contract at init time. The deposit is the runway from which the per-hour runtime fee is drawn. Refundable once the sandbox is fully retired.
     2. **Hourly runtime fee.** Scales with the sandbox size you run. The default snapshot `daytonaio/sandbox:0.5.0-slim` is 1 CPU and 1 GB at about 0.09 Mantle per hour, so a 1 Mantle deposit lasts roughly 11 hours of always-on runtime. The provider also supports larger configurations (e.g. `openclaw` at 2 CPU and 4 GB), priced per CPU-minute plus per-memory-GB-minute; the SandboxResources `class` option (`small`, `medium`, `large`) lets you trade size for cost. Today the init wizard always provisions the slim default; set `sandbox.snapshotName` in `nebula.config.ts` post-init to override. Refill any time with `nebula topup --sandbox N`.
     3. **Pause to save.** `nebula pause` archives the container (stops the burn) without losing identity. `nebula resume` brings the same sandbox back in 2 to 5 minutes. Twelve hours idle per day saves around 1.1 Mantle per day on runtime fees.
3. Pick a subname under `nebula.0g` (optional). The wizard checks on-chain availability at pick time.
4. Pick a brain model from the live Mantle Compute catalog. Per-token pricing shown.
5. Pick a compute ledger deposit size. Starter 3 Mantle, Standard 10 Mantle, Extended 30 Mantle, or Custom.
6. Set a keystore passphrase. This protects the encrypted agent privkey blob anchored on Mantle Storage.

**Phase B. Wallet gate.**

6. Pick operator wallet source. WalletConnect (mobile), macOS Keychain, keystore file, or raw private key.
7. Review the cost summary in Mantle and USD.
8. If the operator balance is below the threshold, the wizard renders the operator address as a QR and polls the balance until you fund it (or you skip the ledger deposit or cancel).

**Phase C. Execute.**

The wizard writes `.nebula-init-state.json` after each completed step so `nebula init --resume` can pick up from a failure.

9. Generate a fresh agent EOA. Save the encrypted keystore locally.
10. Operator signs one transaction: `mint(operatorAddress, intelligentDataEntries)` plus `setApprovalForAll(agentAddress, true)`. The agent EOA is now pre-approved to call `update()` on subsequent memory syncs without re-signing.
11. Operator funds the agent EOA with about 10.1 Mantle. 0.1 covers infra gas, 10 covers the ledger deposit.
12. Agent uploads the encrypted keystore blob to Mantle Storage and anchors the root hash in the `keystore` IntelligentData slot. This is what makes `nebula restore` work on a new machine.
13. Agent opens a Mantle Compute ledger via `broker.ledger.addLedger`.
14. If a subname was chosen, agent claims `<subname>.nebula.0g` via the permissionless `NebulaSubnameRegistrar` and writes the `address` plus `pubkey` text records.

**Phase D.** The wizard writes `nebula.config.ts` with `identity.iNFT`, `identity.operator`, `identity.agent`, `brain.provider`, `brain.model` populated.

## Chat

```
nebula
```

Drops you into the TUI. The status bar at the bottom shows `perms: prompt` (the default approval mode), the current brain model, and the agent's mainnet address. Type something the brain can answer. Try a tool call: "save a note that I prefer dark mode" or "what's my Mantle balance".

Every turn syncs to Mantle Storage and anchors the changed slot hashes on chain. Slash commands: `/sync`, `/yolo`, `/perms <off|prompt|strict>`, `/reset`, `/jobs`, `/model`, `/exit`, `/help`. Type `/` to open the autocomplete popup.

Escape aborts the current turn mid-flight. Control-U and Control-D scroll the history without leaving the input bar.

## Walk away

The agent is fully sovereign once init completes. You do not need to keep the CLI open. Two paths to ambient access:

- **Telegram bridge.** Run `nebula telegram setup` and pair a bot. Any DM hits the same brain, same tools, same approval modal. Approval prompts arrive as inline-keyboard buttons.
- **Mantle Sandbox.** Run `nebula deploy` to migrate the harness to a persistent TDX enclave on Galileo testnet. The laptop CLI becomes a thin client over HTTP and SSE. Burn rate is about 0.09 Mantle per hour on testnet runtime fees.

Read [Architecture](/docs/architecture) next to understand how the layers fit together.

Source: [`packages/cli/src/commands/init.ts`](https://github.com/rstfulzz/nebula/blob/main/packages/cli/src/commands/init.ts), [`packages/cli/src/commands/init`](https://github.com/rstfulzz/nebula/tree/main/packages/cli/src/commands/init).
