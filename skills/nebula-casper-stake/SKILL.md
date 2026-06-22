---
name: nebula-casper-stake
description: "Stake CSPR to earn on the Casper Network: list validators, then delegate/undelegate via native staking — policy-gated and verified on-chain."
metadata:
  openclaw:
    homepage: https://github.com/rstfulzz/nebula
    requires:
      bins:
        - nebula
    install:
      - kind: node
        package: "nebula-ai-agent"
        global: true
---

# nebula · Casper staking (earn)

Earn on Casper the native way — **delegate CSPR to a validator** for staking rewards. On Casper the
primary "earn" primitive is native staking (not lending), so it works on Testnet with no third-party
DeFi. The agent proposes; deterministic policy decides; every write is verified on-chain.

## Capabilities (nebula tools)
- `casper.validators` — list current validators to choose where to delegate.
- `casper.stake` — delegate CSPR to a validator (min 500 CSPR), policy-gated.
- `casper.unstake` — undelegate from a validator.
- `casper.balance` — main-purse CSPR balance.

## Steps
1. **List validators** (`casper.validators`) and pick one.
2. **Plan** — state the validator, amount (≥ 500 CSPR), and that rewards accrue per era.
3. **Guardrail** (`nebula-treasury-guardrail`): amount within cap; over the auto-ceiling → require approval.
4. **Delegate** (`casper.stake`) — broadcast, then verify the on-chain execution result.
5. **Report** the Casper tx hash (testnet.cspr.live) in full.

## Rules
- Minimum delegation is 500 CSPR (protocol-enforced); 1 CSPR = 1e9 motes.
- Every write is policy-gated and on-chain verified — a failed tx is never reported as success.
- Show complete public keys and tx hashes — never truncate.
