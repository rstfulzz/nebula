---
slug: memory
title: Memory
description: A local, content-addressed store. Markdown notes plus an index, kept on the operator's machine.
group: Concepts
order: 5
kicker: 'DOCS · CONCEPTS'
voice_word: local
source: 'README.md'
---

# A local, content-addressed memory.

Nebula keeps a persistent memory store on the operator's machine. It is local SQLite, content-addressed (`0x` plus sha256 CID), so the same content always resolves to the same id and nothing is duplicated. There is no remote storage layer and nothing is uploaded.

## What it stores

The agent writes typed markdown notes plus an index of them. The index is the canonical entry point; the agent reads it to decide which notes to open in full. This keeps the model's working context small while still letting it recall facts it has learned across sessions.

Practical examples of what lands in memory:

- Operator preferences and instructions worth keeping between sessions.
- Facts the agent has confirmed about your treasury or the protocols it works with.
- References to external systems it has been pointed at.

## Why local

Memory is observability and recall, not a safety boundary. Keeping it local keeps the data on your machine and keeps the design honest: nothing about memory can move funds. The thing that can move funds is the policy-gated write pipeline, and that is governed entirely by the deterministic control layer described in [Architecture](/docs/architecture).

## Reading it back

The web console renders the same memory the agent reads, with the same typography you are reading now, so an operator can audit exactly what the agent has stored. See [Console](/docs/console).

Read [Brain](/docs/brain) next.

Source: [`README.md`](https://github.com/rstfulzz/nebula/blob/main/README.md).
