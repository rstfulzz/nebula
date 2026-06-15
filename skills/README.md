# nebula skill pack — Agentic Economy (Byreal Skills CLI)

Agent skills that let **nebula** drive the **[Byreal Skills CLI](https://github.com/byreal-git/byreal-agent-skills)**
(`@byreal-io/byreal-cli`) for multi-step, autonomous on-chain execution — under nebula's
deterministic safety discipline (preview → guardrail → confirm).

Built for the **Agentic Economy** track of the Mantle Turing Test 2026
("multi-step autonomous execution using sponsor components"). These are
[OpenClaw AgentSkills](https://docs.openclaw.ai/tools/skills)-standard `SKILL.md` files.

> Note: Byreal is a **Solana** DEX, so these skills act on Solana via `byreal-cli`. nebula's
> Mantle treasury tools (ERC-8004 identity, Aave, Agni/Moe) remain its core; this pack extends the
> agent to a second venue, keeping the same policy/approval pattern across both.

## Skills

| Skill | What it does |
|---|---|
| `nebula-byreal-swap` | Policy-guarded swap: preview (`--dry-run`), check slippage/caps, execute only on confirm |
| `nebula-byreal-rebalance` | Autonomous multi-step: read balances → analyze pools (APR/TVL) → swap → open CLMM position |
| `nebula-treasury-guardrail` | Deterministic gate: reject over-cap / restricted / high-slippage actions before any execute |

## Setup

```bash
# 1. Install the Byreal Skills CLI (the mandatory sponsor component)
npm install -g @byreal-io/byreal-cli
byreal-cli setup            # interactive wallet/key config (~/.config/byreal/keys/, mode 0600)
byreal-cli wallet address   # verify the active wallet

# 2. Install these skills into your OpenClaw workspace
cp -r skills/* ~/.openclaw/workspace/skills/
openclaw skills list        # confirm they load

# 3. Trigger a skill
openclaw agent --message "rebalance my Byreal position into the best low-risk pool"
```

## Safety constraints (enforced by every skill)
- Always `--dry-run` before `--confirm`.
- Warn on slippage above 200 bps; require explicit confirmation above $1000.
- Show complete addresses/signatures — never truncate.
- A guardrail check must pass before any write — the agent advises, the rules decide.
