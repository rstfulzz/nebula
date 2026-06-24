# nebula-ai-plugin-onchain

The **Casper limbs** for **nebula** — the brain tools that do real on-chain work
on Casper, every value-moving call routed through the deterministic policy →
execute → verify-on-chain pipeline:

- **Reads** — `casper.status` (network + signer), `casper.balance` (main-purse
  CSPR), `casper.validators` (auction state), `casper.policy` (the enforced caps)
- **Transfer** — `casper.send` (native CSPR; min 2.5)
- **Earn** — `casper.stake` / `casper.unstake` (native delegation; min 500 CSPR)

Every write evaluates the deterministic policy (caps, allowlists, autonomy tier)
before signing, then verifies the on-chain execution result before reporting
success. 1 CSPR = 1e9 motes; the caller is a Casper public key / account hash.

## Install

Auto-installed with [`nebula-ai-agent`](https://www.npmjs.com/package/nebula-ai-agent).
Or directly: `bun add nebula-ai-plugin-onchain`.

See the [root README](https://github.com/rstfulzz/nebula#readme) for the full tool reference.
