/**
 * `nebula status` — Casper network + agent snapshot (read-only).
 */
import {
  buildCasperOnchainFromEnv,
  getBalanceMotes,
  getValidators,
  motesToCspr,
} from 'nebula-ai-plugin-onchain'

export async function runStatus(): Promise<void> {
  const ctx = buildCasperOnchainFromEnv()
  console.log(`network    ${ctx.network.network} (${ctx.network.chainName})`)
  console.log(`rpc        ${ctx.network.nodeRpc}`)
  console.log(`policy     ${ctx.policy ? 'enforced' : 'none'}`)

  if (!ctx.pub) {
    console.log('signer     (none — set CASPER_SECRET_KEY_PATH)')
    return
  }
  console.log(`pubkey     ${ctx.pub.toHex()}`)

  try {
    const motes = await getBalanceMotes(ctx.rpc, ctx.pub)
    console.log(`balance    ${motesToCspr(motes)} CSPR`)
  } catch (e) {
    console.log(`balance    (unavailable: ${(e as Error).message.slice(0, 80)})`)
  }
  try {
    const vals = await getValidators(ctx.rpc, 1000)
    console.log(`validators ${vals.length}`)
  } catch {
    /* best-effort */
  }
}
