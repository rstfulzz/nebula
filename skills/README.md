# nebula skill pack — Track 06: Agentic Wallets & Economy (Byreal Skills CLI)

Agent skills that let **nebula** drive the **[Byreal Skills CLI](https://github.com/byreal-git/byreal-agent-skills)**
(`@byreal-io/byreal-cli`) as an **execution layer** for multi-step, autonomous on-chain action —
under nebula's deterministic safety discipline (preview → guardrail → confirm).

These are [OpenClaw AgentSkills](https://docs.openclaw.ai/tools/skills)-standard `SKILL.md` files.

## How this maps to Track 06 (per the organizer ruling, 2026/06/06)

The organizers confirmed a valid Track 06 submission is **either** a new RealClaw skill **or** *"a fully
autonomous agent using the Byreal Skills CLI as its core execution layer"* — that must **demonstrate
agentic features + economy**, be **natively functional on Mantle**, and include **a deployed,
functioning Mantle contract that underpins the agent's economic logic.**

nebula fits as **Option 2 — the autonomous agent**:

- **Autonomous agent + economy** — nebula plans and executes multi-step treasury workflows (the
  skills below), gated by a deterministic policy/approval spine.
- **Natively functional on Mantle** — nebula's core runs on Mantle: Aave V3, Agni, Merchant Moe,
  transfers, and an **ERC-8004 agent-identity/reputation** trust layer. The Byreal Skills CLI is the
  agent's **cross-venue execution layer**.
- **Mantle contract underpinning the agent economy** — the deployed **NebulaIdentityRegistry**
  (ERC-8004) on Mantle mainnet (5000): `0x00a818451dC072d449e92a21d02d6B68fc703588`
  (+ Reputation / Validation). It is the on-chain identity + reputation substrate of the agent economy.

> Honest note: Byreal is a **Solana** CLMM DEX, so `byreal-cli` actions settle on Solana. nebula's
> Mantle-native core (contracts + DeFi tools) provides the "natively functional on Mantle" + Mantle
> contract requirement; Byreal is the sponsor-component execution layer for cross-venue moves.

## Skills

| Skill | What it does |
|---|---|
| `nebula-byreal-swap` | Policy-guarded swap: preview (`--dry-run`), check slippage/caps, execute only on confirm |
| `nebula-byreal-rebalance` | Autonomous multi-step: read balances → analyze pools (APR/TVL) → swap → open CLMM position |
| `nebula-treasury-guardrail` | Deterministic gate: reject over-cap / restricted / high-slippage actions before any execute |

## Verified against `byreal-cli` v0.3.6

The skills use real commands, confirmed live:

```
$ byreal-cli overview
 TVL  $14.35M   Volume (24h) $11.07M   Total Pools 111
$ byreal-cli pools list
 MNT/USDC   8HPQzqMD…PnW8s   TVL $935.49K   APR 7.82%   Fee 0.30%
 USDC/USDT  23XoPQqG…ywsCT   TVL $1.07M     APR 6.33%   Fee 0.01%
$ byreal-cli catalog show dex.swap.execute
 byreal-cli swap execute --input-mint <IN> --output-mint <OUT> --amount <AMT> --slippage <BPS> --dry-run|--confirm
```

(Byreal even lists an **MNT/USDC** pool and tokenized RWAs — XAUt0, TSLAx, NVDAx.)

## Setup

```bash
# 1. Install the Byreal Skills CLI (the mandatory sponsor component)
npm install -g @byreal-io/byreal-cli
byreal-cli setup            # interactive wallet/key config (~/.config/byreal/keys/, mode 0600)
byreal-cli wallet address   # verify the active wallet

# 2. Install these skills into your OpenClaw workspace
cp -r skills/* ~/.openclaw/workspace/skills/
openclaw skills list

# 3. Trigger a skill
openclaw agent --message "rebalance into the best low-risk Byreal pool, within my caps"
```

## Safety constraints (enforced by every skill)
- `--dry-run` before `--confirm`; an `--unsigned-tx` mode builds a tx without local keys (no custody).
- Warn on slippage above 200 bps; require explicit confirmation above $1000.
- Show complete addresses/signatures — never truncate.
- A guardrail check must pass before any write — the agent advises, the rules decide.
