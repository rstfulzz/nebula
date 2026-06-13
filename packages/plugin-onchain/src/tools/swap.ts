/**
 * `swap.quote` + `swap.execute` — AGNI V3 single-pool swaps with 3-tier scan.
 *
 * Quote and execute share the same resolver path so the executed price
 * matches what was quoted (re-quote at exec for slippage protection).
 */

import type { ToolDef } from 'nebula-ai-core'
import { getGasPriceWithFloor } from 'nebula-ai-core'
import { type Address, formatUnits, parseUnits } from 'viem'
import { z } from 'zod'
import { ensureAllowance } from '../allowance'
import {
  DEFAULT_DEADLINE_SECS,
  DEFAULT_SLIPPAGE_BPS,
  AGNI_BY_NETWORK,
  requireMainnet,
} from '../constants'
import { quoteAcrossTiers } from '../quoter'
import { evaluatePolicy } from '../policy'
import { simulateRawTx } from '../simulate'
import { type ExactInputSingleParams, composeSwap } from '../swap'
import { isNativeToken, resolveToken } from '../tokens'
import type { OnchainRuntimeContext, TokenInfo } from '../types'
import { waitForReceipt } from '../wait-receipt'

async function resolveOrNative(
  ctx: OnchainRuntimeContext,
  input: string,
): Promise<{ token: TokenInfo; isNative: boolean } | null> {
  if (isNativeToken(input)) {
    requireMainnet(ctx.network)
    const w0g = AGNI_BY_NETWORK[ctx.network]!.weth9
    return {
      token: {
        address: w0g as Address,
        symbol: 'W0G',
        name: 'Wrapped Mantle',
        decimals: 18,
        source: 'list',
      },
      isNative: true,
    }
  }
  const t = await resolveToken({
    client: ctx.publicClient,
    agentDir: ctx.agentDir,
    input,
  })
  if (!t) return null
  return { token: t, isNative: false }
}

const QuoteSchema = z.object({
  tokenIn: z.string().describe('Input token: symbol, 0x address, or "Mantle"/"native".'),
  tokenOut: z.string().describe('Output token: symbol, 0x address, or "Mantle"/"native".'),
  amountIn: z.string().describe('Input amount in tokenIn units (e.g. "0.005").'),
  slippageBps: z
    .number()
    .int()
    .nonnegative()
    .max(10000)
    .optional()
    .describe(`Slippage tolerance in basis points (default ${DEFAULT_SLIPPAGE_BPS} = 0.5%).`),
})
type QuoteArgs = z.infer<typeof QuoteSchema>

export function makeSwapQuote(ctx: OnchainRuntimeContext): ToolDef<QuoteArgs> {
  return {
    name: 'swap.quote',
    description:
      'Preview a swap on AGNI. Scans all 3 fee tiers and returns the best route + amountOut + amountOutMin (after slippage). Read-only.',
    searchHint: 'swap quote price preview agni dex amountout',
    schema: QuoteSchema,
    handler: async args => {
      try {
        requireMainnet(ctx.network)
        const tin = await resolveOrNative(ctx, args.tokenIn)
        const tout = await resolveOrNative(ctx, args.tokenOut)
        if (!tin) return { ok: false, error: `unknown tokenIn: ${args.tokenIn}` }
        if (!tout) return { ok: false, error: `unknown tokenOut: ${args.tokenOut}` }
        const amountInWei = parseUnits(args.amountIn, tin.token.decimals)
        const quote = await quoteAcrossTiers({
          client: ctx.publicClient,
          network: ctx.network,
          tokenIn: tin.token.address,
          tokenOut: tout.token.address,
          amountIn: amountInWei,
        })
        if (!quote) {
          return {
            ok: false,
            error: `no AGNI pool with liquidity for ${tin.token.symbol}→${tout.token.symbol}`,
          }
        }
        const slippageBps = BigInt(args.slippageBps ?? DEFAULT_SLIPPAGE_BPS)
        const amountOutMin = (quote.amountOut * (10000n - slippageBps)) / 10000n
        return {
          ok: true,
          data: {
            tokenIn: tin.token.symbol,
            tokenOut: tout.token.symbol,
            amountIn: args.amountIn,
            amountOut: formatUnits(quote.amountOut, tout.token.decimals),
            amountOutMin: formatUnits(amountOutMin, tout.token.decimals),
            fee: quote.fee,
            pool: quote.pool,
            slippageBps: Number(slippageBps),
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}

const ExecuteSchema = z.object({
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.string(),
  slippageBps: z.number().int().nonnegative().max(10000).optional(),
})
type ExecuteArgs = z.infer<typeof ExecuteSchema>

export function makeSwapExecute(ctx: OnchainRuntimeContext): ToolDef<ExecuteArgs> {
  return {
    name: 'swap.execute',
    description:
      'Execute a swap on AGNI. Re-quotes at exec time for slippage protection; auto-approves the router for ERC-20 input on first use. Native via multicall+refundETH; native output via unwrapWETH9 chain.',
    searchHint: 'swap execute trade agni dex exchange',
    schema: ExecuteSchema,
    handler: async args => {
      try {
        requireMainnet(ctx.network)
        const account = ctx.walletClient.account
        if (!account) return { ok: false, error: 'walletClient has no account; cannot swap' }
        const agni = AGNI_BY_NETWORK[ctx.network]!
        const tin = await resolveOrNative(ctx, args.tokenIn)
        const tout = await resolveOrNative(ctx, args.tokenOut)
        if (!tin) return { ok: false, error: `unknown tokenIn: ${args.tokenIn}` }
        if (!tout) return { ok: false, error: `unknown tokenOut: ${args.tokenOut}` }
        const amountInWei = parseUnits(args.amountIn, tin.token.decimals)
        // Policy gate (deterministic): block BEFORE any allowance/quote/execute.
        if (ctx.policy) {
          const verdict = evaluatePolicy(
            {
              kind: 'swap',
              asset: tin.isNative ? 'native' : tin.token.address,
              amountRaw: amountInWei,
              slippageBps: Number(args.slippageBps ?? DEFAULT_SLIPPAGE_BPS),
            },
            ctx.policy,
          )
          if (!verdict.allowed) {
            return { ok: false, error: `policy blocked: ${verdict.violations.join('; ')}` }
          }
        }
        // Quote and allowance are independent: race them so the ERC-20 path
        // doesn't pay two sequential RPC round-trips when one would do.
        // Native input has no allowance to ensure (router pulls via msg.value).
        const [quote, allow] = await Promise.all([
          quoteAcrossTiers({
            client: ctx.publicClient,
            network: ctx.network,
            tokenIn: tin.token.address,
            tokenOut: tout.token.address,
            amountIn: amountInWei,
          }),
          tin.isNative
            ? Promise.resolve({ approved: false, txHash: undefined as `0x${string}` | undefined })
            : ensureAllowance({
                publicClient: ctx.publicClient,
                walletClient: ctx.walletClient,
                token: tin.token.address,
                owner: ctx.agentEoa,
                spender: agni.swapRouter as Address,
                amount: amountInWei,
              }),
        ])
        if (!quote) {
          return {
            ok: false,
            error: `no AGNI pool for ${tin.token.symbol}→${tout.token.symbol}`,
          }
        }
        const slippageBps = BigInt(args.slippageBps ?? DEFAULT_SLIPPAGE_BPS)
        const amountOutMin = (quote.amountOut * (10000n - slippageBps)) / 10000n
        const approveTxHash = allow.txHash

        const params: ExactInputSingleParams = {
          tokenIn: tin.token.address,
          tokenOut: tout.token.address,
          fee: quote.fee,
          recipient: ctx.agentEoa,
          deadline: BigInt(Math.floor(Date.now() / 1000)) + DEFAULT_DEADLINE_SECS,
          amountIn: amountInWei,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0n,
        }
        const composed = composeSwap({
          params,
          nativeIn: tin.isNative,
          nativeOut: tout.isNative,
          router: agni.swapRouter as Address,
        })
        // Simulate-before-write: dry-run the composed swap; abort if it would revert.
        const sim = await simulateRawTx(ctx.publicClient, {
          account: account.address,
          to: composed.to,
          data: composed.data,
          value: composed.value,
        })
        if (!sim.ok) {
          return { ok: false, error: `pre-flight simulation reverted: ${sim.reason}` }
        }
        const gasPrice = await getGasPriceWithFloor(ctx.publicClient)
        const txHash = await ctx.walletClient.sendTransaction({
          to: composed.to,
          data: composed.data,
          value: composed.value,
          chain: ctx.walletClient.chain,
          account,
          gasPrice,
        })
        const receipt = await waitForReceipt(ctx.publicClient, txHash)
        return {
          ok: true,
          data: {
            ...(approveTxHash ? { approveTxHash } : {}),
            txHash,
            blockNumber: Number(receipt.blockNumber),
            gasUsed: receipt.gasUsed.toString(),
            tokenIn: tin.token.symbol,
            tokenOut: tout.token.symbol,
            amountIn: args.amountIn,
            amountOutExpected: formatUnits(quote.amountOut, tout.token.decimals),
            amountOutMin: formatUnits(amountOutMin, tout.token.decimals),
            fee: quote.fee,
            pool: quote.pool,
            status: receipt.status === 'success' ? 'success' : 'reverted',
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
