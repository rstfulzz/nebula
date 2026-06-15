# nebula-ai-agent

The `nebula` CLI — a **Mantle-native, policy-aware AI treasury assistant**. Real
on-chain work on Mantle (balances, transfers, swaps, wrap/unwrap, Aave lending,
yield discovery, ERC-8004 identity) from your terminal, where every value-moving
action is checked against a deterministic policy, dry-run simulated, and held for
approval before broadcast. The model proposes; code disposes.

## Install

```bash
bun add -g nebula-ai-agent
nebula init     # bootstrap an agent (plain-EOA identity, local encrypted keystore)
nebula          # chat with your agent
```

Requires [bun](https://bun.sh) — the CLI shebangs `bun`.

## Commands

```
nebula init                bootstrap a new agent identity + local keystore
nebula [--yolo]            interactive chat (default; --yolo skips approvals)
nebula status              agent + wallet + config state
nebula logs                tail the activity log
nebula drain --to <addr>   sweep the agent EOA balance
nebula model               re-pick the brain model
nebula identity <sub>      ERC-8004 agent identity  (card | register | show)
nebula telegram <sub>      phone-DM gateway         (setup | status | remove)
nebula pairing <sub>       DM pairing approvals     (list | approve | revoke | clear-pending)
nebula gateway <sub>       always-on daemon         (run | start | stop | restart | status | logs)
```

Configure the brain with `OPENAI_API_KEY` (or any OpenAI-compatible `NEBULA_LLM_*`),
set `NEBULA_POLICY_*` fund-control limits, and fund the agent EOA with a little MNT
for gas. Material-risk actions pause for your approval.

See the [root README](https://github.com/rstfulzz/nebula#readme) for architecture
and the full reference.
