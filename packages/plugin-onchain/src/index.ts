/**
 * nebula-ai-plugin-onchain
 *
 * 18 brain limbs for on-chain operations on Mantle mainnet:
 *
 *   Wallet/account:  account.info
 *   Balance:         chain.balance
 *   Tokens:          tokens.info
 *   Transfers:       chain.send, chain.wrap, chain.unwrap
 *   Trading:         swap.quote, swap.execute  (Agni V3, 3-tier scan)
 *   Lending:         aave.position, aave.supply, aave.withdraw  (Aave V3)
 *   Blockchain:      chain.block, chain.gas
 *   Analysis:        chain.tx, chain.contract, chain.activity
 *   Generic:         chain.read, chain.write
 *
 * Side-band runtime ctx attached to PluginContext under `.onchain` (see
 * `OnchainRuntimeContext` in `./types.ts`). Without it, the plugin registers
 * nothing — graceful no-op for unit-test loaders.
 */

import type { NativePlugin, ToolDef } from 'nebula-ai-core'
export {
  simulateNativeSend,
  simulateContractWrite,
  simulateRawTx,
  type SimResult,
} from './simulate'
export {
  evaluatePolicy,
  policyFromEnv,
  type OnchainPolicy,
  type PolicyAction,
  type PolicyVerdict,
} from './policy'
export { policyRequiresApprovalForCall } from './approval'
import { makeAccountInfo } from './tools/account'
import { makeAccountBalance } from './tools/account-balance'
import { makeChainActivity, makeChainContract, makeChainTx } from './tools/analysis'
import { makeChainBalance } from './tools/balance'
import { makeChainBlock, makeChainGas } from './tools/blockchain'
import { makeChainRead, makeChainWrite } from './tools/generic'
import { makeAavePosition, makeAaveSupply, makeAaveWithdraw } from './tools/aave'
import { makeSwapExecute, makeSwapQuote } from './tools/swap'
import { makeTokensInfo } from './tools/tokens-info'
import { makeChainSend } from './tools/transfer'
import { makeChainUnwrap, makeChainWrap } from './tools/wrap'
import type { OnchainRuntimeContext } from './types'

export { ONCHAIN_GUIDANCE } from './guidance'
export { discoverMintBlock } from './mint-block'
export type { OnchainRuntimeContext } from './types'
export {
  AGNI_BY_NETWORK,
  AAVE_POOL_BY_NETWORK,
  MULTICALL3,
  FEE_TIERS,
  DEFAULT_DEADLINE_SECS,
  DEFAULT_SLIPPAGE_BPS,
} from './constants'

const plugin: NativePlugin = {
  name: 'onchain',
  register: ctx => {
    const onchain = (ctx as unknown as { onchain?: OnchainRuntimeContext }).onchain
    if (!onchain) return // soft-init for tests/non-onchain contexts

    ctx.registerTool(makeAccountInfo(onchain) as ToolDef)
    ctx.registerTool(makeAccountBalance(onchain) as ToolDef)
    ctx.registerTool(makeChainBalance(onchain) as ToolDef)
    ctx.registerTool(makeTokensInfo(onchain) as ToolDef)

    ctx.registerTool(makeChainSend(onchain) as ToolDef)
    ctx.registerTool(makeChainWrap(onchain) as ToolDef)
    ctx.registerTool(makeChainUnwrap(onchain) as ToolDef)

    ctx.registerTool(makeSwapQuote(onchain) as ToolDef)
    ctx.registerTool(makeSwapExecute(onchain) as ToolDef)

    ctx.registerTool(makeAavePosition(onchain) as ToolDef)
    ctx.registerTool(makeAaveSupply(onchain) as ToolDef)
    ctx.registerTool(makeAaveWithdraw(onchain) as ToolDef)

    ctx.registerTool(makeChainBlock(onchain) as ToolDef)
    ctx.registerTool(makeChainGas(onchain) as ToolDef)

    ctx.registerTool(makeChainTx(onchain) as ToolDef)
    ctx.registerTool(makeChainContract(onchain) as ToolDef)
    ctx.registerTool(makeChainActivity(onchain) as ToolDef)

    ctx.registerTool(makeChainRead(onchain) as ToolDef)
    ctx.registerTool(makeChainWrite(onchain) as ToolDef)
  },
}

export default plugin
