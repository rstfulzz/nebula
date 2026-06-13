---
slug: agents
title: For Agents
description: How AI agents (Claude Code, Codex, Cursor) install and operate nebula for a human user. What works headless, what does not, what to never claim.
group: Reference
order: 11
kicker: 'DOCS · REFERENCE'
voice_word: honest
source: 'apps/web/content/docs/11-agents.md'
---

# An honest guide for AI agents.

You are an LLM. A human asked you to install nebula. This page tells you exactly what you can do for them, what you must hand back, and what you should never claim. The goal is fewer hallucinated fallbacks and fewer hung scripts.

If you only read one line: **bun is required, `npm install -g` succeeds but the binary fails at runtime, and `nebula init` is interactive (no stdin piping; puppet it in tmux or guide the user).**

## The install gotcha that bites every agent

The CLI ships with the shebang `#!/usr/bin/env bun`. When a user runs `npm install -g @nebula/cli`, the install step succeeds and a working `nebula` binary lands on `PATH`. The next time the binary runs, the OS resolves the shebang and exits with `env: bun: No such file or directory`. Most agents see the install succeed and assume the next failure is unrelated.

Install bun first. Always.

```
curl -fsSL https://bun.sh/install | bash
bun add -g @nebula/cli
nebula init
```

The published package is [`@nebula/cli`](https://www.npmjs.com/package/@nebula/cli). The bin name is `nebula`. Requires bun >=1.1. Current release is v0.24.17, pre-alpha. Always have the user run `nebula --version` so you know exactly what surface you are working against.

## What you can do for the user

- Install the package (`bun add -g @nebula/cli`) and dependencies (`bun` itself, if missing).
- Read and write `nebula.config.ts` in the user's project directory. The type is exported as `defineConfig` from `@nebula/core`. See [Configuration](/docs/configuration).
- Explain commands. The CLI surface is documented at [CLI](/docs/cli). The five commands the user will run most often are `nebula init`, `nebula` (drops into TUI), `nebula status`, `nebula balance`, `nebula logs --tail N`.
- Debug errors. Run `nebula status` and `nebula logs --tail 50` and read the output. Activity log paths are documented below.
- Inspect on-chain state. `nebula inspect [ref]` decodes the IntelligentData slots for any iNFT, including foreign ones with `--raw`. See [Identity](/docs/identity).
- Top up the agent or the compute ledger. `nebula topup --agent N` (operator to agent EOA) or `nebula topup --compute N` (agent to Mantle Compute ledger). Both are single-step.

## How to drive init

`nebula init` is interactive. The wizard uses `@clack/prompts` for eight blocking selects, with no env-var bypass except `NEBULA_OPERATOR_PRIVKEY` (which only skips one inner password field for the raw-privkey wallet branch). The prompts, in order:

1. Network select (mainnet vs Galileo testnet)
2. Deploy target select (local vs Mantle Sandbox)
3. Subname text input (optional, blank to skip)
4. Brain model select (fetched live from the Mantle Compute catalog)
5. Ledger deposit size select (Starter / Standard / Extended / Custom)
6. Keystore passphrase
7. Operator wallet source select (WalletConnect / Keychain / keystore file / raw privkey)
8. "Proceed?" confirm after cost summary

You have two paths to completing init from an agent:

**Path A: guide the human.** Walk the user through each prompt. They run `nebula init`, you advise on each choice. Read the [Quickstart](/docs/quickstart) so you know what each phase costs and what each prompt expects. This is the right path if you have no terminal access (pure API call, no shell).

**Path B: puppet the TUI.** If you have `tmux` (or another pty-capable wrapper) on the operator's machine, you can drive init end to end without a human at the keyboard. Spawn `nebula init` in a tmux pane, `tmux capture-pane` to read each prompt, decide the answer, `tmux send-keys` to type it. Claude Code, Codex, and similar agents with shell access can do this. The wizard does not detect the puppeteer because keystrokes arrive through a real pty.

Naive piping (`echo y | nebula init`, `expect` scripts that write to stdin) will hang on the first `select()` because `@clack/prompts` checks for a real TTY and waits indefinitely otherwise.

## One-shot chat does not exist

There is no `--prompt`, `--exec`, or non-TUI chat mode. `nebula` and `nebula chat` both drop into a `@opentui/solid` TUI. The brain runs per turn while the TUI is open or the gateway daemon is running. To ask the brain one question and exit, either drive the TUI in tmux (same pattern as Path B above) or send a message via the standalone gateway daemon's HTTP/SSE surface (see [Architecture](/docs/architecture)).

## No centralized fallback

Nebula has no path to OpenAI, Anthropic, or any other provider. The brain is Mantle Compute via `@0glabs/0g-serving-broker` (TeeML attested). When Mantle Compute is down, the agent halts and the user sees the error. Telling the user "I'll switch you to OpenAI" is wrong. There is no `OPENAI_API_KEY` config path.

## Anti-patterns to avoid

- **Do NOT** promise OpenAI/Anthropic fallback. None exists. Brain halt is real halt.
- **Do NOT** point users at `~/.nebula/agents/<id>/activity.jsonl` as the activity log. That path is the legacy embedded-mode location. The default since v0.21.5 is the standalone gateway daemon, whose log lives at `$TMPDIR/nebula-gateway/<id>/activity.jsonl`. Either use `nebula logs --tail N` (works in every mode) or read the standalone path. The legacy path is silent on a default install.
- **Do NOT** vary contract addresses by network. NebulaAgentNFT, NebulaSubnameRegistrar, NebulaInbox, NebulaMarket are CREATE2-deployed so mainnet (chainId 16661) and Galileo testnet (chainId 16602) share the same addresses. Only NebulaSubnameRegistrar is mainnet-only by design.
- **Do NOT** default to mainnet for exploratory inits. Galileo testnet (`network: 'mantle-testnet'`) is free from the [faucet](https://faucet.mantle.xyz). Mainnet Starter mint costs about 3.12 Mantle of real money before the user has anything to show for it. Switch to mainnet once the user is ready.
- **Do NOT** script destructive operations. `nebula drain --to <addr>` sweeps the agent EOA. `nebula ledger refund` starts a per-provider lock window. Both are recoverable but slow. Always have the user confirm before running them.

## Common errors and fixes

| Error string | Where | Fix |
|---|---|---|
| `env: bun: No such file or directory` | OS, on first `nebula` run | Install bun: `curl -fsSL https://bun.sh/install \| bash` |
| `Operator balance N Mantle, need M Mantle more` | `init.ts:234` | Fund the operator address shown by the wizard's QR. Wizard polls until funded. |
| `Compute ledger sub-account short by N Mantle` | `og-compute.ts:711` | `nebula topup --compute 2` (or larger). The provider sub-account has run dry. |
| `Brain HTTP <status>` | `chat.tsx:1320` | Mantle Compute outage or provider eviction. Agent halts. No workaround. Try a different provider via `nebula model`. |
| `unlock failed: <msg>` | `chat.tsx:226` | Wrong keystore passphrase, or operator wallet mismatch on v0.6+ keystores. Verify operator address. |
| `gateway unreachable at <socket>` | `chat-sandbox.tsx:98` | Run `nebula gateway start`. The standalone gateway daemon was not running. |
| `unsupported memory blob version 0x2` | Browser-side (console) | v0.21.14 introduced gzip v=2 memory blobs. Upgrade the reader (apps/web v0.21.14+). |

## Where state lives

A clean install creates two trees.

The user's home, under `~/.nebula/`:

```
~/.nebula/
├── config.ts                    user-level config (rare; most users put config in cwd)
└── agents/
    └── <agentId>/               sha256(iNFT contract + tokenId)
        ├── keystore.json        operator-encrypted agent privkey
        ├── cache/               local cache of Mantle Storage data
        ├── memory/
        │   ├── agent/           transfers with iNFT
        │   ├── user/            purges on transfer
        │   └── MEMORY.md        index, 200-line / 25 KB cap
        ├── runtime/state.json
        ├── inbox/               A2A inbound
        ├── pairing/             telegram pairing tokens
        ├── gateway.sock         daemon socket when running
        └── activity.jsonl       LEGACY embedded-mode log, do not rely on
```

The current project directory holds `nebula.config.ts` (TS module). The agent runs from wherever the user invokes `nebula`; configuration is per-cwd, state is global per agent.

The gateway daemon's activity log (default since v0.21.5) lives outside `~/.nebula/`:

```
$TMPDIR/nebula-gateway/<agentId>/activity.jsonl
```

On macOS that path resolves under `/var/folders/...`. Use `nebula logs --tail N` from any cwd to read it without hunting for `$TMPDIR`.

## CLI surface most agents need

- `nebula --version`: confirm the user is on the surface you expect (currently v0.24.17).
- `nebula init`: interactive only, see above.
- `nebula` or `nebula chat`: drop into the TUI. User types from there.
- `nebula status`: agent state, wallet positions, config snapshot.
- `nebula logs --tail 50`: recent activity log entries. JSONL, includes `tool-call`, `brain-response`, errors.
- `nebula balance`: full economic position: operator EOA, agent EOA, compute ledger, sandbox reserve.
- `nebula inspect [ref]`: decode IntelligentData slots from chain. `--slot keystore`, `--diff`, `--full`, `--raw` for foreign iNFTs.
- `nebula topup --agent N`: operator sends N Mantle to agent EOA.
- `nebula topup --compute N`: agent deposits N Mantle into Mantle Compute ledger.
- `nebula model`: re-pick brain provider and model from the live Mantle Compute catalog.
- `nebula sync`: force a memory and activity-log flush plus on-chain anchor.
- `nebula restore <iNFT-ref>`: recover an agent on a new machine. Ref formats: `eip155:16661:0x...:N` or `mantle-mainnet:0x...:N`.

Skip the niche admin commands (`nebula admin autotopup-tick`, `nebula drain`, `nebula ledger refund`) unless the user explicitly asks for them.

## How this doc stays current

This page is regenerated from the same `apps/web/content/docs/*.md` source as the rest of the docs. Machine-readable surfaces:

- [/llms.txt](/llms.txt): index file with one bullet per doc, install line, contract addresses. Fetch this first.
- [/llms-full.txt](/llms-full.txt): single-file dump of every doc plus the README. About 35 KB.
- [/docs/<slug>.md](/docs/agents.md): raw markdown per page (e.g. `/docs/quickstart.md`, `/docs/cli.md`). Use these when you want one section without the HTML chrome.

When the CLI version moves, this page moves with it. Always re-fetch before relying on cached prior advice.
