# Nebula — demo walkthrough

A 5-minute tour of the thesis: **the AI advises, deterministic code enforces the fund controls.** Every example below is a real capability, wired and tested in this repo.

## Setup

```bash
bun install
export OPENAI_API_KEY=sk-...            # any OpenAI-compatible key

# Arm the deterministic fund-control policy (this is the whole point):
export NEBULA_POLICY_MAX_NATIVE_MNT=2.0        # hard cap: block sends over 2 MNT
export NEBULA_POLICY_AUTO_MAX_NATIVE_MNT=0.1   # auto up to 0.1 MNT; above → require approval
export NEBULA_POLICY_MAX_SLIPPAGE_BPS=100      # block swaps over 1% slippage

bun run nebula init        # generates a local agent EOA (no on-chain mint needed)
bun run nebula chat        # terminal chat
```

Fund the agent EOA shown by `init` with a little MNT for gas.

---

## 1. The control layer is legible

> **you:** what are my limits?

The agent calls `policy.show` and reports the enforced boundary verbatim — hard cap 2 MNT, auto-execute up to 0.1 MNT (above that needs approval), swaps capped at 100 bps. These come from `NEBULA_POLICY_*`, evaluated in pure code, not from the model's judgment.

## 2. A hard cap blocks — the model cannot talk its way past it

> **you:** send 5 MNT to 0xC635e6Eb223aE14143E23cEEa9440bC773dc87Ec

`chain.send` runs `evaluatePolicy` first. 5 MNT exceeds the 2 MNT hard cap, so the tool returns `policy blocked: native amount ... exceeds per-tx cap` **before any signing or broadcast.** No prompt, no override. (`packages/plugin-onchain/src/policy.ts`, 11 unit tests.)

## 3. The approval floor — material-risk pauses even in YOLO

> **you:** /yolo
> **you:** send 0.5 MNT to 0xC635...87Ec

Even with approvals "disabled," 0.5 MNT is above the 0.1 MNT auto-ceiling, so the policy floor forces an approval prompt anyway. Approve → it executes; deny → it stops. This is the key idea: the deterministic floor sits **beneath** the session permission mode, so YOLO can't silently move material funds. (`packages/core/src/permission/service.ts`, `force` path.)

## 4. Pre-flight simulation kills doomed transactions

Every write is dry-run (`estimateGas` / `simulateContract`) before broadcast. Ask for a transfer that would revert (e.g. an ERC-20 you don't hold) and it returns `pre-flight simulation reverted: <decoded reason>` with zero gas spent. (`packages/plugin-onchain/src/simulate.ts`.)

## 5. Yield discovery with risk + RWA awareness

> **you:** best stablecoin yield on Mantle?

`defi.yields` (DeFiLlama, read-only) returns Mantle pools ranked by APY with risk signals — `stablecoin`, `ilRisk`, `exposure`, 7-day trend — and flags **restricted** products (USDY/MI4/mUSD) so the agent only proposes them with eligibility confirmation. Discovery only; it never moves funds.

## 6. Best execution across two DEX venues

> **you:** what's the best price to swap 5 MNT to USDC?

`swap.compare` quotes **both** Agni Finance and Merchant Moe (Liquidity Book) and reports the winner with the edge. Verified live: `Agni 2.764977 USDC vs Merchant Moe 2.720912 USDC (+1.61%)`.

> **you:** do it

`swap.best` re-quotes both, routes to the better venue, and executes it through the same policy → simulate → approval → execute pipeline, returning a decision receipt (`simGasEstimate`, `policyEnforced`, tx hash).

## 7. Lending — the full Aave V3 suite

> **you:** what are the Aave rates? then supply 5 USDC and borrow 2 USDT

`aave.markets` lists every reserve's live supply + variable-borrow APR (e.g. WETH 6.94%/8.39%, USDC 2.73%/3.67%). Then `aave.supply` (policy-gated, simulated) deposits collateral; `aave.borrow` opens variable-rate debt and the receipt reports the **resulting health factor** (lower = closer to liquidation); `aave.repay max` clears it. `aave.position` shows collateral / debt / health factor at any time.

## 8. Unified treasury position (idle + deployed, in USD)

> **you:** what are we worth?

`treasury.summary` returns one number and where it sits: idle wallet (native MNT + ERC-20s) plus funds deployed in Aave, USD-valued, with the idle-vs-deployed split. Prices are **free**: DeFiLlama's public REST with an **on-chain Agni-quote fallback** (no API key) — so even a token DeFiLlama doesn't list still gets valued if it's tradeable. `account.info` and `tokens.price` use the same free pricing.

## 9. Vet a token before touching it

> **you:** is 0xUNKNOWN… safe to buy?

`risk.token` returns a low/elevated/high verdict from: price feed, can-you-exit (a live quote on both DEXes), liquidity depth, the restricted-RWA flag, and a real-contract check. A token with no route or no contract code is **high** ("you could not exit this"); a restricted RWA is **elevated** ("confirm eligibility").

## 10. Dry-run anything before doing it

> **you:** would calling `redeem(1000)` on 0x… work?

`tx.simulate` previews any contract call — `wouldSucceed` + gas estimate, or the decoded revert reason — **without broadcasting**. The same engine that guards every write, exposed as a read-only tool.

## 11. Same agent, from your phone

```bash
bun run nebula telegram setup
```

The Telegram bot drives the identical agent with the identical approval gates — material-risk actions arrive as inline-keyboard approvals.

---

## What to look at in the code

| Claim | Where |
| --- | --- |
| Deterministic policy (pure, auditable) | `packages/plugin-onchain/src/policy.ts` + `policy.test.ts` |
| Pre-flight simulation | `packages/plugin-onchain/src/simulate.ts` |
| Approval floor (beneath the session mode) | `packages/core/src/permission/service.ts` (`force`) + `permission.test.ts` |
| Policy → approval wiring | `packages/plugin-onchain/src/approval.ts` + the CLI/gateway `pre_tool_call` hooks |
| Best execution | `packages/plugin-onchain/src/tools/swap-best.ts` |
| Yield discovery + RWA flags | `packages/plugin-onchain/src/defillama.ts` |
| Token risk verdict (pure rubric) | `packages/plugin-onchain/src/risk.ts` + `risk.test.ts` |
| Free dual-source pricing | `packages/plugin-onchain/src/pricing.ts` |
| Treasury USD aggregation (pure) | `packages/plugin-onchain/src/treasury.ts` + `treasury.test.ts` |
| Dry-run any call | `packages/plugin-onchain/src/tools/simulate-tx.ts` |

Run the safety boundary's tests directly:

```bash
bun test packages/plugin-onchain/src/policy.test.ts \
         packages/plugin-onchain/src/approval.test.ts \
         packages/core/src/permission/permission.test.ts
```
