/**
 * Live end-to-end smoke against Mantle MAINNET — one command, no private key.
 *
 *   bun run smoke      (or: bun test/smoke-live.ts)
 *
 * Exercises a read across every capability + the safety gates (policy + simulate
 * short-circuit before any send). The on-chain/discovery/risk checks need no
 * keys (public Mantle RPC + DeFiLlama). The Nansen + Bybit checks use the keys
 * in .env when present and degrade gracefully when not — so this stays green for
 * anyone. NOT part of `bun test` (it hits the network); run it on demand.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPublicClient, http } from 'viem'
import { policyFromEnv } from '../packages/plugin-onchain/src/policy.ts'
import { makeAaveMarkets, makeAavePosition } from '../packages/plugin-onchain/src/tools/aave.ts'
import { makeAccountInfo } from '../packages/plugin-onchain/src/tools/account.ts'
import { makeChainGas } from '../packages/plugin-onchain/src/tools/blockchain.ts'
import { makeCexBalance } from '../packages/plugin-onchain/src/tools/cex.ts'
import { makeDefiYields } from '../packages/plugin-onchain/src/tools/defillama.ts'
import { makeNansenLabels } from '../packages/plugin-onchain/src/tools/nansen.ts'
import { makeRiskToken } from '../packages/plugin-onchain/src/tools/risk.ts'
import { makeTxSimulate } from '../packages/plugin-onchain/src/tools/simulate-tx.ts'
import { makeSwapCompare } from '../packages/plugin-onchain/src/tools/swap-best.ts'
import { makeChainSend } from '../packages/plugin-onchain/src/tools/transfer.ts'

const USDC = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9'
// A public Mantle address used purely for read targets (no key, no signing).
const READ_ADDR = '0x3B4f0135465d444a5bD06Ab90fC59B73916C85F5'
// A read-only floor for the policy demo when no NEBULA_POLICY_* env is set.
const policy = policyFromEnv() ?? { maxNativeWeiPerTx: 2n * 10n ** 18n }

const ctx = {
  network: 'mantle-mainnet' as const,
  agentEoa: READ_ADDR as `0x${string}`,
  agentDir: mkdtempSync(join(tmpdir(), 'nebula-smoke-')),
  publicClient: createPublicClient({ transport: http('https://rpc.mantle.xyz') }),
  walletClient: { account: { address: READ_ADDR }, chain: { id: 5000 } } as never,
  mintBlock: 0n,
  policy,
}

let pass = 0
let fail = 0
async function check(name: string, fn: () => Promise<boolean>) {
  try {
    const ok = await fn()
    console.log(`${ok ? '✅' : '❌'} ${name}`)
    ok ? pass++ : fail++
  } catch (e) {
    console.log(`❌ ${name} — threw: ${(e as Error).message.slice(0, 80)}`)
    fail++
  }
}

console.log('\n— Nebula live smoke (Mantle mainnet) — policy ARMED —\n')

await check('chain.gas → price + MNT cost estimates', async () => {
  const r = await makeChainGas(ctx).handler({})
  return r.ok === true && !!r.data.estimatedCostMnt.swap
})
await check('defi.yields → Mantle pools (DeFiLlama)', async () => {
  const r = await makeDefiYields(ctx).handler({ limit: 3 })
  return r.ok === true && r.data.pools.length > 0
})
await check('risk.token (USDC) → low risk, tradeable', async () => {
  const r = await makeRiskToken(ctx).handler({ token: USDC })
  return r.ok === true && r.data.level === 'low'
})
await check('swap.compare (5 MNT→USDC) → best of Agni / Merchant Moe', async () => {
  const r = await makeSwapCompare(ctx).handler({ tokenIn: 'MNT', tokenOut: USDC, amountIn: '5' })
  return r.ok === true && !!r.data.best?.venue
})
await check('aave.markets → reserves with live rates', async () => {
  const r = await makeAaveMarkets(ctx).handler({})
  return r.ok === true && r.data.count > 0
})
await check('aave.position → health factor', async () => {
  const r = await makeAavePosition(ctx).handler({})
  return r.ok === true && typeof r.data.healthFactor === 'string'
})
await check('account.info → wallet snapshot', async () => {
  const r = await makeAccountInfo(ctx).handler({})
  return r.ok === true && !!r.data.wallet
})
await check('tx.simulate → catches a doomed call (would revert)', async () => {
  const r = await makeTxSimulate(ctx).handler({
    to: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8',
    signature: 'withdraw(uint256)',
    args: ['999000000000000000000'],
  })
  return r.ok === true && r.data.wouldSucceed === false
})
await check('POLICY: an over-cap chain.send is blocked deterministically', async () => {
  const r = await makeChainSend(ctx).handler({ to: READ_ADDR, amount: '5' })
  return r.ok === false && /policy blocked/.test(r.error ?? '')
})
await check('nansen.labels → runs (intel with NANSEN_API_KEY + credits, else graceful)', async () => {
  const r = await makeNansenLabels(ctx).handler({ address: READ_ADDR })
  return r.ok === true
})
await check('cex.balance → runs (Bybit read with BYBIT keys, else graceful)', async () => {
  const r = await makeCexBalance(ctx).handler({})
  return r.ok === true
})

console.log(`\n— ${pass} passed, ${fail} failed —\n`)
process.exit(fail === 0 ? 0 : 1)
