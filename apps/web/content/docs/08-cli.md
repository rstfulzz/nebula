---
slug: cli
title: CLI
description: Every nebula command, every flag. The CLI is the single orchestration plane.
group: Reference
order: 8
kicker: 'DOCS · REFERENCE'
voice_word: single
source: 'packages/cli/src/commands'
---

# A single orchestration plane.

The `nebula` binary owns onboarding, chat, deployment, recovery, and admin. Commands are one file per command at `packages/cli/src/commands/`. Most read or write a small piece of agent state. A few orchestrate longer flows like `init` or `deploy`.

## Onboarding

`nebula init` runs the four-phase wizard described in [Quickstart](/docs/quickstart). `nebula init --resume` picks up from the first incomplete agent-side step using the state file at `.nebula-init-state.json`.

`nebula restore <iNFT-ref>` recovers an agent on a new machine from its iNFT. Accepts `eip155:16661:0xCONTRACT:tokenId` or `mantle-mainnet:0xCONTRACT:tokenId`. Reads slot 4 (keystore), prompts the operator wallet to decrypt, rehydrates.

`nebula migrate-keystore` performs the one-time v0.5 (passphrase) to v0.6 (operator-wallet) keystore upgrade.

## Chat

`nebula` (or `nebula chat`) drops into the interactive TUI. Per-turn auto-sync to Mantle and chain anchor. Slash commands: `/sync`, `/yolo`, `/perms <off|prompt|strict>`, `/reset`, `/jobs`, `/model`, `/exit`, `/help`. Type `/` to open the autocomplete popup; Tab or Enter commits, arrow keys cycle, Esc dismisses.

On Telegram the same `/` autocomplete is available via `setMyCommands`. `/yolo`, `/perms`, `/reset` flip the permission mode and clear conversation from the operator's phone.

Keybinds: `Esc` aborts the current turn mid-flight. `Ctrl+U` and `Ctrl+D` (or `Opt+U` and `Opt+D` if your terminal sends Opt as Alt) scroll history without leaving the input bar.

In sandbox mode the laptop CLI is a thin client over HTTP and SSE. Tool indicators arrive over SSE. The brain runs in the sandbox container.

`nebula --yolo` boots chat with the approval system disabled. Status bar shows `perms: off`.

## Status and inspection

`nebula status` prints agent state, wallet positions, and config snapshot. In sandbox mode also probes `/healthz` and provider sandbox state in parallel.

`nebula logs [--tail N] [--agent <id>]` tails the activity log. In sandbox mode tails `/var/log/nebula-harness.log` inside the container via the provider toolbox exec.

`nebula balance` prints the full economic position: EOA mainnet, EOA testnet, compute ledger total / available / locked, per-provider envelopes, sandbox billing reserve. No agent unlock required. Use this before topping up so you know what is locked versus available.

`nebula inspect [ref] [flags]` decodes IntelligentData slots. Default decrypts every slot via the operator wallet and prints plaintext. Flags: `--slot <name>` filters to one slot, `--tx <hash>` decodes an `update()` transaction, `--raw` skips decryption, `--diff` compares local plaintext to chain plaintext via keccak256, `--json` structured output, `--full` removes the 40-line truncation, `--out <dir>` dumps every decrypted slot to disk. Foreign iNFTs auditable in raw mode via positional ref.

## Topup and ledger

`nebula topup --agent N` operator sends N Mantle to the agent EOA for infra gas.

`nebula topup --compute N` agent deposits N Mantle into the Mantle Compute ledger.

`nebula topup --sandbox N` operator deposits N Mantle into the Galileo SandboxBilling contract for runtime fees. (`--provider N` is a deprecated alias kept for v0.17.1 runbooks.)

`nebula ledger [balance|refund|retrieve|close]` drains a retiring agent's compute ledger. `balance` shows main plus per-provider sub-account state. `retrieve` starts the per-provider lock window. Call again after the window to actually pull. `refund [--amount N | --all]` withdraws from main back to the agent EOA. `close --yes` deletes the ledger entirely.

`nebula drain --to <addr>` sweeps the agent EOA's native balance to a target. Defaults to `config.identity.operator` if `--to` omitted. Reserves 21000 times the live gas price for the sweep tx, sends the rest. Use after `nebula ledger refund` to finish recovering funds.

## Sync

`nebula sync` forces a memory plus activity-log flush to Mantle Storage and anchors on chain. In sandbox mode proxies to the harness `POST /sync` (no laptop-side keystore decrypt).

## Brain selection

`nebula model` re-picks the brain provider and model from the live Mantle Compute catalog. Writes `brain.provider` and `brain.model` in `nebula.config.ts`.

## Sandbox lifecycle

`nebula deploy` migrates a local agent to Mantle Sandbox. Decrypts the local keystore via operator wallet, runs the Galileo deposit and acknowledge, creates the sandbox, sends the bootstrap script, performs the ECIES Option 3 keystore handoff, publishes `agent:endpoint` on the subname. Operator never plaintexts the privkey on the laptop after handoff.

`nebula upgrade [<ref>] [--ref vX.Y.Z] [--yes] [--reprovision]` rolls the sandbox harness to a new git ref preserving identity and memory. With no args (or `latest`), resolves the latest published release via the GitHub API. Default mode is in-place: `git fetch` plus `checkout` plus `bun install` plus harness restart inside the existing container (30 to 60 seconds downtime). `--reprovision` opts into a fresh-container swap (2 to 5 minutes).

`nebula pause` archives a started sandbox to stop the runtime burn during dev gaps. Sandbox UUID and endpoint preserved. Resume with `nebula resume` (2 to 5 minutes for filesystem restore). Does not require operator-keystore unlock, only the operator wallet to sign the archive request. Burn rate of about 0.09 Mantle per hour means a 12 hour idle window saves around 1.1 Mantle per day on testnet runtime fees.

`nebula resume` wakes a stopped or archived sandbox plus re-handoffs the agent privkey to the (newly restarted) harness. Same sandbox UUID and endpoint preserved. Use when the harness goes offline (Daytona auto-archive after 60 min idle, or `INSUFFICIENT_BALANCE` settlement event).

## Gateway

`nebula gateway [start|stop|restart|status|logs|run]` manages the local gateway daemon. Local mode runs an always-on `nebula-gateway-local` process bound to `~/.nebula/agents/<id>/gateway.sock`. Telegram and A2A events route through it even when the TUI is closed (cron and webhook listeners are reserved for a later release).

## Telegram

`nebula telegram [setup|status|remove]` manages the Telegram bot integration. Setup pairs a bot token plus allowed user IDs. Inbound DMs route through the gateway and become brain events.

## Pairing

`nebula pairing [list|approve|revoke|clear-pending]` manages paired machines. OTP-based; useful for cross-machine Telegram dispatch where the gateway is on a different host than the operator's phone.

## Admin

`nebula admin <sub>` runs operator-only ops endpoints. `autotopup-tick` live-fires one `AutoTopupManager` poll cycle (skips the 5-minute wait) for diagnosing envelope refills. Local mode hits the gateway unix sock. Sandbox mode signs the payload with the operator wallet (EIP-191) and POSTs to the sandbox endpoint.

Read [Configuration](/docs/configuration) next.

Source: [`packages/cli/src/commands`](https://github.com/rstfulzz/nebula/tree/main/packages/cli/src/commands).
