# nebula-ai-agent

The `nebula` CLI — a **Casper-native, policy-aware AI treasury agent**. Real
on-chain work on Casper (balances, transfers, native staking, validators,
on-chain identity) from your terminal, where every value-moving action is checked
against a deterministic policy and verified on-chain — and held for approval when
it moves material funds. The model proposes; code disposes.

## Install

```bash
bun add -g nebula-ai-agent
nebula init     # verify the Casper account + env
nebula          # chat with your agent
```

Requires [bun](https://bun.sh) — the CLI shebangs `bun`.

## Commands

```
nebula init                verify the Casper account + env (keys, network, balance)
nebula [--yolo]            interactive chat (default; --yolo skips approvals)
nebula status              network + signer + policy state
nebula logs                tail the activity log
nebula drain --to <key>    sweep the agent's CSPR to a public key
nebula model               re-pick the brain model
nebula identity <sub>      on-chain agent identity  (card | register | show)
nebula telegram <sub>      phone-DM gateway         (setup | status | remove)
nebula pairing <sub>       DM pairing approvals     (list | approve | revoke | clear-pending)
nebula gateway <sub>       always-on daemon         (run | start | stop | restart | status | logs)
```

Configure the brain with `OPENAI_API_KEY` (or any OpenAI-compatible `NEBULA_LLM_*`),
set `NEBULA_POLICY_*` fund-control limits, point `CASPER_SECRET_KEY_PATH` +
`CSPR_CLOUD_API_KEY` at your Casper signer + node, and fund the account with a
little CSPR for gas. Material-risk actions pause for your approval.

See the [root README](https://github.com/rstfulzz/nebula#readme) for architecture
and the full reference.
