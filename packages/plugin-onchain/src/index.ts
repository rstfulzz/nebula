/**
 * nebula-ai-plugin-onchain
 *
 * Brain limbs for on-chain operations on Mantle:
 *
 *   Wallet/account:  account.info, account.balance
 *   Balance:         chain.balance
 *   Tokens:          tokens.info
 *   Transfers:       chain.send, chain.wrap, chain.unwrap
 *   Trading:         swap.quote, swap.execute  (Agni V3, 3-tier scan)
 *                    moe.quote, moe.swap        (Merchant Moe Liquidity Book)
 *                    swap.compare, swap.best    (multi-venue best execution)
 *   Lending:         aave.position, aave.markets, aave.supply, aave.withdraw,
 *                    aave.borrow, aave.repay  (Aave V3)
 *   Discovery:       defi.yields  (DeFiLlama, read-only analytics)
 *   Risk:            risk.token   (pre-trade token risk assessment, read-only)
 *                    nansen.labels  (Nansen counterparty intel, env NANSEN_API_KEY)
 *   Controls:        policy.show  (active fund-control policy, read-only)
 *   Blockchain:      chain.block, chain.gas
 *   Analysis:        chain.tx, chain.contract, chain.activity
 *   Generic:         chain.read, chain.write, tx.simulate
 *
 * Value-moving tools run through policy -> simulate -> (approval) -> execute.
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
import {
  makeAaveBorrow,
  makeAaveMarkets,
  makeAavePosition,
  makeAaveRepay,
  makeAaveSupply,
  makeAaveWithdraw,
} from './tools/aave'
import { makeAccountInfo } from './tools/account'
import { makeAccountBalance } from './tools/account-balance'
import { makeChainActivity, makeChainContract, makeChainTx } from './tools/analysis'
import { makeChainBalance } from './tools/balance'
import { makeChainBlock, makeChainGas } from './tools/blockchain'
import { makeCexBalance } from './tools/cex'
import { makeDefiYields } from './tools/defillama'
import { makeChainRead, makeChainWrite } from './tools/generic'
import { makeIdentityRegister, makeIdentityResolve } from './tools/identity'
import { makeMoeQuote, makeMoeSwap } from './tools/moe'
import { makeNansenLabels } from './tools/nansen'
import { makePolicyShow } from './tools/policy-show'
import { makeRiskToken } from './tools/risk'
import { makeTxSimulate } from './tools/simulate-tx'
import { makeSwapExecute, makeSwapQuote } from './tools/swap'
import { makeSwapBest, makeSwapCompare } from './tools/swap-best'
import { makeTokensInfo } from './tools/tokens-info'
import { makeChainSend } from './tools/transfer'
import {
  makeReputationGive,
  makeReputationShow,
  makeValidationRequest,
  makeValidationRespond,
  makeValidationShow,
} from './tools/trust'
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

    ctx.registerTool(makeMoeQuote(onchain) as ToolDef)
    ctx.registerTool(makeMoeSwap(onchain) as ToolDef)

    ctx.registerTool(makeSwapCompare(onchain) as ToolDef)
    ctx.registerTool(makeSwapBest(onchain) as ToolDef)

    ctx.registerTool(makeAavePosition(onchain) as ToolDef)
    ctx.registerTool(makeAaveMarkets(onchain) as ToolDef)
    ctx.registerTool(makeAaveSupply(onchain) as ToolDef)
    ctx.registerTool(makeAaveWithdraw(onchain) as ToolDef)
    ctx.registerTool(makeAaveBorrow(onchain) as ToolDef)
    ctx.registerTool(makeAaveRepay(onchain) as ToolDef)

    ctx.registerTool(makeDefiYields(onchain) as ToolDef)
    ctx.registerTool(makeRiskToken(onchain) as ToolDef)
    ctx.registerTool(makeNansenLabels(onchain) as ToolDef)
    ctx.registerTool(makeCexBalance(onchain) as ToolDef)
    ctx.registerTool(makePolicyShow(onchain) as ToolDef)

    ctx.registerTool(makeIdentityResolve(onchain) as ToolDef)
    ctx.registerTool(makeIdentityRegister(onchain) as ToolDef)
    ctx.registerTool(makeReputationGive(onchain) as ToolDef)
    ctx.registerTool(makeReputationShow(onchain) as ToolDef)
    ctx.registerTool(makeValidationRequest(onchain) as ToolDef)
    ctx.registerTool(makeValidationRespond(onchain) as ToolDef)
    ctx.registerTool(makeValidationShow(onchain) as ToolDef)

    ctx.registerTool(makeChainBlock(onchain) as ToolDef)
    ctx.registerTool(makeChainGas(onchain) as ToolDef)

    ctx.registerTool(makeChainTx(onchain) as ToolDef)
    ctx.registerTool(makeChainContract(onchain) as ToolDef)
    ctx.registerTool(makeChainActivity(onchain) as ToolDef)

    ctx.registerTool(makeChainRead(onchain) as ToolDef)
    ctx.registerTool(makeChainWrite(onchain) as ToolDef)
    ctx.registerTool(makeTxSimulate(onchain) as ToolDef)
  },
}

export default plugin
