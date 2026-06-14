---
slug: console
title: Console
description: Chat with your treasury in the browser. Ask in plain English; get live on-chain answers. Reads need nothing; signing in adds saved history and owner-gated transfers.
group: Operate
order: 10
kicker: 'DOCS · OPERATE'
voice_word: browser
source: 'apps/web/app/console'
---

# Chat with your treasury, in the browser.

The console at [/console](/console) is nebula as a chat. Ask plain-English questions about your money on Mantle and it answers with **live on-chain data** — and when you ask it to move funds, deterministic code (not the AI) enforces the limits.

## What you need to set up

Almost nothing to start.

1. **Open [/console](/console) and type.** Reads — balances, gas, yields, prices, swap quotes, ERC-8004 lookups — work with **no wallet and no sign-in**. The brain and the on-chain connection are already wired for you.
2. **Connect your wallet** (top-right) when you want nebula to know which wallet is "yours". Now "what's my balance / my portfolio" just answers for your address — no pasting addresses.
3. **Sign in** (one signature — Sign-In with Ethereum) when you want to:
   - **save your chat history** to your wallet and sync it across devices, and
   - **authorize transfers** — only the signed-in owner can move funds, and only within policy.

No API key, no install. (Want to run it yourself with your own keys and limits? See the [Quickstart](/docs/quickstart) and [CLI](/docs/cli).)

## What you can ask

- **Portfolio & positions** — "what's my portfolio worth?", "what does `0x…` hold?"
- **Yields** — "best stablecoin yield on Mantle right now?"
- **Swap** — "what would I get for 100 USDC → MNT?" (live indicative quote; execution is coming)
- **Transfer** — "simulate sending 0.05 MNT to `0x…`", "send 0.01 MNT to `0x…`" (owner-only, simulated, policy-capped)
- **Trust** — "show ERC-8004 agent #1 and its reputation"

New here? Tap the **template menu** (the ☰ left of the input) for one-tap starters, grouped by activity: Yields, Swap, Transfer, Portfolio & positions.

## Your chats are saved

Every conversation is kept. **Signed in**, your history lives on the server keyed to your wallet, so it follows you across devices and browsers. **Signed out**, it's saved in this browser. The sidebar lists past chats — switch between them, or delete one. "New chat" starts fresh. Disconnecting your wallet simply hides that wallet's chats; they come back when you reconnect.

## Is it safe?

The AI only **advises**. Every value-moving action goes through deterministic, policy-checked code: it's **simulated first**, **capped** by hard limits the model can't raise, and (for transfers) **gated to the signed-in owner**. Reads can never move funds. So you can explore freely and stay in control of anything that touches money.

## Your agents (ERC-8004)

[/console/agents](/console/agents) lists the on-chain agent identities your wallet owns — registration, agent card, reputation, and validations. Connect and sign in to load them from chain.

Read the [Quickstart](/docs/quickstart) to run your own agent, or [Introduction](/docs/introduction) for the bigger picture.

Source: [`apps/web/app/console`](https://github.com/rstfulzz/nebula/tree/main/apps/web/app/console).
