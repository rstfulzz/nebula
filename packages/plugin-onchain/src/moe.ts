/**
 * Merchant Moe Liquidity Book quote + swap-calldata builder.
 *
 * The LBQuoter's `findBestPathFromAmountIn(route, amountIn)` returns the best
 * route across LB pairs as parallel arrays (route, binSteps, versions, amounts).
 * The last `amounts` element is the output. Those arrays feed directly into the
 * router's `Path` struct, so the executed swap uses exactly the quoted route.
 *
 * Native handling: the quoter/router treat native MNT via WNATIVE (WMNT), so a
 * native leg uses the WMNT address in the token path plus the native-specific
 * router entrypoint (swapExactNATIVEForTokens / swapExactTokensForNATIVE).
 */

import { type Address, type PublicClient, encodeFunctionData } from 'viem'
import { LB_QUOTER_ABI, LB_ROUTER_ABI } from './abis'

export interface MoeQuote {
  /** Token path the router will use (== quoter route). */
  route: readonly Address[]
  /** Per-hop bin steps for the Path struct. */
  binSteps: readonly bigint[]
  /** Per-hop pair versions (0=V1, 1=V2, 2=V2_1, 3=V2_2). */
  versions: readonly number[]
  /** Quoted output amount (raw units of the last route token). */
  amountOut: bigint
}

/**
 * Quote `amountIn` of `route[0]` to `route[route.length-1]` via Merchant Moe LB.
 * Returns null when no route has liquidity (amountOut == 0).
 */
export async function quoteMoe(opts: {
  client: PublicClient
  quoter: Address
  route: readonly Address[]
  amountIn: bigint
}): Promise<MoeQuote | null> {
  const { client, quoter, route, amountIn } = opts
  const q = (await client.readContract({
    address: quoter,
    abi: LB_QUOTER_ABI,
    functionName: 'findBestPathFromAmountIn',
    args: [route as readonly Address[], amountIn],
  })) as {
    route: readonly Address[]
    binSteps: readonly bigint[]
    versions: readonly number[]
    amounts: readonly bigint[]
  }
  const amounts = q.amounts
  const amountOut = amounts.length > 0 ? amounts[amounts.length - 1]! : 0n
  if (amountOut === 0n) return null
  return { route: q.route, binSteps: q.binSteps, versions: q.versions, amountOut }
}

export interface MoeSwapCalldata {
  data: `0x${string}`
  /** msg.value (native input only). */
  value: bigint
}

/**
 * Encode the LB router swap call. Picks the entrypoint by native in/out:
 *  - native IN  -> swapExactNATIVEForTokens (msg.value = amountIn)
 *  - native OUT -> swapExactTokensForNATIVE
 *  - ERC-20 ↔ ERC-20 -> swapExactTokensForTokens
 */
export function encodeMoeSwap(opts: {
  quote: MoeQuote
  amountIn: bigint
  amountOutMin: bigint
  to: Address
  deadline: bigint
  nativeIn: boolean
  nativeOut: boolean
}): MoeSwapCalldata {
  const { quote, amountIn, amountOutMin, to, deadline, nativeIn, nativeOut } = opts
  const path = {
    pairBinSteps: quote.binSteps as readonly bigint[],
    versions: quote.versions as readonly number[],
    tokenPath: quote.route as readonly Address[],
  }
  if (nativeIn) {
    return {
      data: encodeFunctionData({
        abi: LB_ROUTER_ABI,
        functionName: 'swapExactNATIVEForTokens',
        args: [amountOutMin, path, to, deadline],
      }),
      value: amountIn,
    }
  }
  if (nativeOut) {
    return {
      data: encodeFunctionData({
        abi: LB_ROUTER_ABI,
        functionName: 'swapExactTokensForNATIVE',
        args: [amountIn, amountOutMin, path, to, deadline],
      }),
      value: 0n,
    }
  }
  return {
    data: encodeFunctionData({
      abi: LB_ROUTER_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [amountIn, amountOutMin, path, to, deadline],
    }),
    value: 0n,
  }
}
