# nebula skill pack — Track 06: Agentic Wallets & Economy

A **Byreal-style agentic Skills layer**, in two parts:

1. **Mantle-native (the Track-06 core)** — Byreal's pools/swap/positions interface, but executing on
   **Mantle** via nebula's deployed integrations. This is "the first Mantle-compatible Byreal-style
   agentic skills layer," and it's **natively functional on Mantle**.
2. **Solana (cross-venue)** — skills that drive the real **[Byreal Skills CLI](https://github.com/byreal-git/byreal-agent-skills)**
   (`@byreal-io/byreal-cli`) for genuine sponsor-tool usage on Solana.

All are [OpenClaw AgentSkills](https://docs.openclaw.ai/tools/skills)-standard `SKILL.md` files, each
gated by nebula's discipline: **discover → simulate → guardrail → confirm.**

## Why two layers
Byreal's CLI is **hardwired to Solana** (depends on `@byreal-io/byreal-clmm-sdk`; no EVM/Mantle path in
the code). So a project can't make *Byreal itself* run on Mantle. The organizer ruling (2026/06/06)
says a valid Track 06 entry is *"a fully autonomous agent using the Byreal Skills CLI as its execution
layer,"* that is **natively functional on Mantle** with **a deployed Mantle contract underpinning the
agent's economic logic.** nebula does both: it uses the real Byreal CLI (Solana) *and* contributes the
Mantle-native equivalent backed by its own Mantle contracts.

## Layer 1 — Mantle-native (Track-06 core)

| Skill | Byreal analog | Mantle execution |
|---|---|---|
| `nebula-mantle-pools` | `overview` / `pools list` / `pools analyze` | DeFiLlama yields + Agni/Merchant Moe quotes |
| `nebula-mantle-swap` | `swap execute` | **Agni V3 + Merchant Moe** best-route, simulated |
| `nebula-mantle-lp` | `positions open/close/claim` | **Aave V3** supply/borrow/withdraw/repay |
| `nebula-treasury-guardrail` | (Byreal's safety constraints) | deterministic reject gate |

**Deployed Mantle contracts (the agent economy's substrate):**
- **ERC-8004 Identity** `0x00a818451dC072d449e92a21d02d6B68fc703588` (+ Reputation / Validation) — agent identity + reputation.
- Agni V3 SwapRouter `0x319B69888b0d11cEC22caA5034e25FfFBDc88421`
- Merchant Moe Router `0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a`
- Aave V3 Pool `0x458F293454fE0d67EC0655f3672301301DD51422`

Execution backend = nebula's `plugin-onchain`, already live on Mantle (the console at nebulaai.space
executes these for real).

## Layer 2 — Solana (Byreal Skills CLI, cross-venue)

| Skill | What it does |
|---|---|
| `nebula-byreal-swap` | Policy-guarded `byreal-cli swap execute` (dry-run → guardrail → confirm) |
| `nebula-byreal-rebalance` | Autonomous multi-step rebalance into Byreal CLMM pools |

Verified against `byreal-cli` v0.3.6 (real commands: `catalog show dex.swap.execute`,
`swap execute --input-mint/--output-mint/--slippage`, `pools list`).

## Setup

```bash
# Mantle layer (nebula)
npm install -g nebula-ai-agent
nebula init                      # pick Mantle, set signer, fund the derived agent wallet

# Solana layer (Byreal, optional cross-venue)
npm install -g @byreal-io/byreal-cli
byreal-cli setup

# Install skills into your OpenClaw workspace
cp -r skills/* ~/.openclaw/workspace/skills/
openclaw skills list
```

## Safety constraints (every skill)
- Simulate / dry-run before any execute; confirm explicitly above ~$1000; warn above 200 bps slippage.
- A guardrail check must pass before any write — the agent advises, the rules decide.
- No custody: the user's wallet signs (Mantle) or keys stay local (`~/.config/byreal/keys/`, Solana).
- Show complete addresses and tx hashes — never truncate.
