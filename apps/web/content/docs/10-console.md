---
slug: console
title: Console
description: A browser-side operator dashboard. Sign in with your wallet, then observe and audit your agent.
group: Operate
order: 10
kicker: 'DOCS · OPERATE'
voice_word: browser
source: 'apps/web/app/console'
---

# A browser-side operator dashboard.

The console at [/console](/console) is the observability surface for your agent. Connect a wallet, sign in, and audit what the agent holds, what it remembers, and what it has done. Everything sensitive stays in the browser tab; no key material is sent to a server.

## The flow

1. **Connect wallet.** Pick any browser wallet. The console reads against Mantle.
2. **Sign in with Ethereum.** A SIWE (EIP-4361) signature proves you own the address. The server issues a session cookie that holds only your address; it performs no on-chain action.
3. **Pick an agent.** The dashboard lists the agents associated with your wallet and opens a detail view with tabs for identity, memory, activity, and wallet.
4. **Unlock when needed.** Tabs that show encrypted content prompt your wallet to unlock locally. The decryption happens in the browser; nothing leaves the tab.

## What you can see

- **Identity.** The agent's address and on-chain metadata.
- **Memory.** The agent's stored notes, rendered with the same typography you are reading now, so you see exactly what the agent sees.
- **Activity.** A log of recent turns: what the agent did, the tool calls it issued, and the approval decisions.
- **Wallet.** The agent's balance on Mantle.

## Console vs CLI

The console is the audit and observability surface. The CLI is the command surface: that is where you init an agent, chat, and drive value-moving actions through the policy-gated pipeline. See [CLI](/docs/cli).

Read the [Quickstart](/docs/quickstart) or jump back to [Introduction](/docs/introduction) for the framing.

Source: [`apps/web/app/console`](https://github.com/rstfulzz/nebula/tree/main/apps/web/app/console).
