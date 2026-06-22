/**
 * nebula-ai-plugin-onchain — Casper-native on-chain tools for Nebula.
 *
 *   Reads:    casper.status, casper.balance, casper.validators, casper.policy
 *   Transfer: casper.send  (native CSPR; min 2.5)
 *   Earn:     casper.stake, casper.unstake  (native delegation; min 500 CSPR)
 *
 * Value-moving tools run policy -> execute -> verify-on-chain. The host attaches
 * a CasperOnchainContext at ctx.onchain; without it the plugin is a no-op.
 */
export * from './config'
export * from './client'
export * from './transfer'
export * from './stake'
export * from './policy'
export * from './context'
export * from './tools'

import type { CasperOnchainContext } from './context'
import {
  makeStatus,
  makeBalance,
  makeSend,
  makeValidators,
  makeStake,
  makeUnstake,
  makePolicyShow,
  type CasperTool,
} from './tools'

/** Build the full Casper tool set for a context. */
export function casperTools(ctx: CasperOnchainContext): CasperTool[] {
  return [makeStatus, makeBalance, makeSend, makeValidators, makeStake, makeUnstake, makePolicyShow].map(
    (f) => f(ctx),
  )
}

const plugin = {
  name: 'onchain',
  register: (ctx: any) => {
    const onchain: CasperOnchainContext | undefined = ctx?.onchain
    if (!onchain) return // soft no-op for non-onchain / test contexts
    for (const tool of casperTools(onchain)) ctx.registerTool(tool)
  },
}

export default plugin
