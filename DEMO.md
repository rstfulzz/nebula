# Nebula — demo walkthrough

A 5-minute tour of the thesis: **the AI advises, deterministic code enforces the fund controls.** Every example below is a real capability, wired and tested in this repo on Casper Testnet.

## Setup

```bash
bun install
export OPENAI_API_KEY=sk-...                  # any OpenAI-compatible key
export CSPR_CLOUD_API_KEY=...                  # CSPR.cloud (indexed reads + node RPC)
export CASPER_CHAIN_NAME=casper-test
export CASPER_NODE_RPC=https://node.testnet.cspr.cloud/rpc
export CASPER_SECRET_KEY_PATH=/path/to/secret_key.pem   # outside the repo

# Arm the deterministic fund-control policy (this is the whole point):
export NEBULA_POLICY_MAX_NATIVE_CSPR=100       # hard cap: block sends over 100 CSPR
export NEBULA_POLICY_AUTO_MAX_NATIVE_CSPR=5    # auto up to 5 CSPR; above → require approval
export NEBULA_POLICY_AUTONOMY=auto             # auto | confirm | readonly

bun run nebula init        # verifies the Casper account + env (no on-chain mint needed)
bun run nebula chat        # terminal chat on Casper
```

Fund the account shown by `init` with CSPR from the testnet faucet (`testnet.cspr.live/tools/faucet`). 1 CSPR = 10^9 motes.

---

## 1. The control layer is legible

> **you:** what are my limits?

The agent calls `casper.policy` and reports the enforced boundary verbatim — hard cap 100 CSPR, auto-execute up to 5 CSPR (above that needs approval), autonomy tier. These come from `NEBULA_POLICY_*`, evaluated in pure code, not from the model's judgment.

## 2. A hard cap blocks — the model cannot talk its way past it

> **you:** send 200 CSPR to 0203dc4a23af775ed29fc045565256c35b3519cc9bad1b7e7051172ce2cffc61cc45

`casper.send` runs `evaluatePolicy` first. 200 CSPR exceeds the 100 CSPR hard cap, so the tool returns `policy blocked: native amount ... exceeds per-tx cap` **before any signing or broadcast.** No prompt, no override. (`packages/plugin-onchain/src/policy.ts`, unit-tested.)

## 3. The approval floor — material-risk pauses even in YOLO

> **you:** /yolo
> **you:** send 10 CSPR to 0203dc4a…cc45

Even with approvals "disabled," 10 CSPR is above the 5 CSPR auto-ceiling, so the policy floor forces an approval prompt anyway. Approve → it executes; deny → it stops. This is the key idea: the deterministic floor sits **beneath** the session permission mode, so YOLO can't silently move material funds. (`packages/core/src/permission/service.ts`, `force` path.)

## 4. Verified on-chain before it reports success

A send within policy (e.g. `send 3 CSPR to …`) is signed, submitted via the CSPR.cloud node, and then **confirmed** by reading the execution result back from chain. The receipt carries the real deploy/transaction hash (`testnet.cspr.live/transaction/<hash>`); a failed execution is reported as failed, never as success. (`packages/plugin-onchain/src/transfer.ts` + `waitForExecution`.)

## 5. Live, grounded reads — never invented numbers

> **you:** what is my CSPR balance, and list 3 validators

`casper.balance` reads the account's main purse; `casper.validators` reads the current auction state. Every figure the agent cites comes from a tool result, not the model.

## 6. Earn — native staking

> **you:** stake 500 CSPR to <validator public key>

`casper.stake` delegates to a validator (Casper's native earn primitive), gated by the same policy → execute → verify pipeline. Minimum delegation is 500 CSPR; `casper.unstake` undelegates. Staking is real protocol participation, not a synthetic yield.

## 7. Same agent, everywhere

```bash
bun run nebula            # terminal
# web console (apps/web) — connect a Casper wallet via CSPR.click
bun run nebula telegram setup   # phone DMs, identical approval gates
```

The web console and the Telegram bot drive the **identical** agent with the identical policy floor — material-risk actions arrive as approvals.

---

## What to look at in the code

| Claim | Where |
| --- | --- |
| Deterministic policy (pure, auditable) | `packages/plugin-onchain/src/policy.ts` + `policy.test.ts` |
| On-chain verification of every write | `packages/plugin-onchain/src/transfer.ts` / `stake.ts` (`waitForExecution`) |
| Approval floor (beneath the session mode) | `packages/core/src/permission/service.ts` (`force`) + `permission.test.ts` |
| Casper tools (status/balance/validators/send/stake) | `packages/plugin-onchain/src/tools.ts` + `tools.test.ts` |
| On-chain registries (identity/reputation/validation) + AMM | `contracts/src/*.rs` (Odra → Wasm) |

Run the safety boundary's tests directly:

```bash
bun test packages/plugin-onchain/src/policy.test.ts \
         packages/plugin-onchain/src/tools.test.ts
```
