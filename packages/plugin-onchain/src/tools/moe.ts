/**
 * `moe.quote` + `moe.swap` — Merchant Moe Liquidity Book swaps.
 *
 * A second on-chain DEX venue alongside Agni. The brain can quote both
 * (`swap.quote` for Agni, `moe.quote` for Merchant Moe) and execute on whichever
 * is better — agent-driven best execution. `moe.swap` runs the same fund-control
 * pipeline as every other write: policy -> simulate -> (approval) -> execute.
 */

import type { ToolDef } from 'nebula-ai-core'
import { getGasPriceWithFloor } from 'nebula-ai-core'
import { type Address, formatUnits, parseUnits } from 'viem'
import { z } from 'zod'
import { ensureAllowance } from '../allowance'
import {
  AGNI_BY_NETWORK,
  DEFAULT_DEADLINE_SECS,
  DEFAULT_SLIPPAGE_BPS,
  MOE_LB_BY_NETWORK,
  requireMainnet,
} from '../constants'
import { encodeMoeSwap, quoteMoe } from '../moe'
import { evaluatePolicy } from '../policy'
import { simulateRawTx } from '../simulate'
import { isNativeToken, resolveToken } from '../tokens'
import type { OnchainRuntimeContext, TokenInfo } from '../types'
import { waitForReceipt } from '../wait-receipt'

/** WMNT is the wrapped-native used as the path endpoint for native legs. */
function wmnt(ctx: OnchainRuntimeContext): Address {
  return AGNI_BY_NETWORK[ctx.network]!.weth9 as Address
}

async function resolveOrNative(
  ctx: OnchainRuntimeContext,
  input: string,
): Promise<{ token: TokenInfo; isNative: boolean } | null> {
  if (isNativeToken(input)) {
    requireMainnet(ctx.network)
    return {
      token: {
        address: wmnt(ctx),
        symbol: 'WMNT',
        name: 'Wrapped Mantle',
        decimals: 18,
        source: 'list',
      },
      isNative: true,
    }
  }
  const t = await resolveToken({ client: ctx.publicClient, agentDir: ctx.agentDir, input })
  if (!t) return null
  return { token: t, isNative: false }
}

const QuoteSchema = z.object({
  tokenIn: z.string().describe('Input token: symbol, 0x address, or "MNT"/"native".'),
  tokenOut: z.string().describe('Output token: symbol, 0x address, or "MNT"/"native".'),
  amountIn: z.string().describe('Input amount in tokenIn units (e.g. "1.5").'),
  slippageBps: z
    .number()
    .int()
    .nonnegative()
    .max(10000)
    .optional()
    .describe(`Slippage tolerance in basis points (default ${DEFAULT_SLIPPAGE_BPS} = 0.5%).`),
})
type QuoteArgs = z.infer<typeof QuoteSchema>

export function makeMoeQuote(ctx: OnchainRuntimeContext): ToolDef<QuoteArgs> {
  return {
    name: 'moe.quote',
    description:
      'Preview a swap on Merchant Moe (Liquidity Book). Returns the best LB route + amountOut + amountOutMin (after slippage). Read-only. Quote both moe.quote and swap.quote (Agni) to pick the best venue.',
    searchHint: 'moe merchant moe quote swap price preview liquidity book lb dex best execution',
    schema: QuoteSchema,
    handler: async (args: QuoteArgs) => {
      try {
        requireMainnet(ctx.network)
        const moe = MOE_LB_BY_NETWORK[ctx.network]!
        const tin = await resolveOrNative(ctx, args.tokenIn)
        const tout = await resolveOrNative(ctx, args.tokenOut)
        if (!tin) return { ok: false, error: `unknown tokenIn: ${args.tokenIn}` }
        if (!tout) return { ok: false, error: `unknown tokenOut: ${args.tokenOut}` }
        const amountInWei = parseUnits(args.amountIn, tin.token.decimals)
        const quote = await quoteMoe({
          client: ctx.publicClient,
          quoter: moe.quoter as Address,
          route: [tin.token.address, tout.token.address],
          amountIn: amountInWei,
        })
        if (!quote) {
          return {
            ok: false,
            error: `no Merchant Moe LB route with liquidity for ${tin.token.symbol}→${tout.token.symbol}`,
          }
        }
        const slippageBps = BigInt(args.slippageBps ?? DEFAULT_SLIPPAGE_BPS)
        const amountOutMin = (quote.amountOut * (10000n - slippageBps)) / 10000n
        return {
          ok: true,
          data: {
            venue: 'Merchant Moe (Liquidity Book)',
            tokenIn: tin.token.symbol,
            tokenOut: tout.token.symbol,
            amountIn: args.amountIn,
            amountOut: formatUnits(quote.amountOut, tout.token.decimals),
            amountOutMin: formatUnits(amountOutMin, tout.token.decimals),
            hops: quote.route.length - 1,
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

export function makeMoeSwap(ctx: OnchainRuntimeContext): ToolDef<ExecuteArgs> {
  return {
    name: 'moe.swap',
    description:
      'Execute a swap on Merchant Moe (Liquidity Book). Re-quotes at exec for slippage protection; auto-approves the router for ERC-20 input on first use. Runs policy -> simulate -> (approval) -> execute like every write.',
    searchHint: 'moe merchant moe swap execute trade liquidity book lb dex exchange',
    schema: ExecuteSchema,
    handler: async (args: ExecuteArgs) => {
      try {
        requireMainnet(ctx.network)
        const account = ctx.walletClient.account
        if (!account) return { ok: false, error: 'walletClient has no account; cannot swap' }
        const moe = MOE_LB_BY_NETWORK[ctx.network]!
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

        const [quote, allow] = await Promise.all([
          quoteMoe({
            client: ctx.publicClient,
            quoter: moe.quoter as Address,
            route: [tin.token.address, tout.token.address],
            amountIn: amountInWei,
          }),
          tin.isNative
            ? Promise.resolve({ approved: false, txHash: undefined as `0x${string}` | undefined })
            : ensureAllowance({
                publicClient: ctx.publicClient,
                walletClient: ctx.walletClient,
                token: tin.token.address,
                owner: ctx.agentEoa,
                spender: moe.router as Address,
                amount: amountInWei,
              }),
        ])
        if (!quote) {
          return {
            ok: false,
            error: `no Merchant Moe LB route for ${tin.token.symbol}→${tout.token.symbol}`,
          }
        }
        const slippageBps = BigInt(args.slippageBps ?? DEFAULT_SLIPPAGE_BPS)
        const amountOutMin = (quote.amountOut * (10000n - slippageBps)) / 10000n
        const approveTxHash = allow.txHash

        const composed = encodeMoeSwap({
          quote,
          amountIn: amountInWei,
          amountOutMin,
          to: ctx.agentEoa,
          deadline: BigInt(Math.floor(Date.now() / 1000)) + DEFAULT_DEADLINE_SECS,
          nativeIn: tin.isNative,
          nativeOut: tout.isNative,
        })

        const sim = await simulateRawTx(ctx.publicClient, {
          account: account.address,
          to: moe.router as Address,
          data: composed.data,
          value: composed.value,
        })
        if (!sim.ok) {
          return { ok: false, error: `pre-flight simulation reverted: ${sim.reason}` }
        }
        const gasPrice = await getGasPriceWithFloor(ctx.publicClient)
        const txHash = await ctx.walletClient.sendTransaction({
          to: moe.router as Address,
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
            venue: 'Merchant Moe (Liquidity Book)',
            ...(approveTxHash ? { approveTxHash } : {}),
            txHash,
            blockNumber: Number(receipt.blockNumber),
            gasUsed: receipt.gasUsed.toString(),
            tokenIn: tin.token.symbol,
            tokenOut: tout.token.symbol,
            amountIn: args.amountIn,
            amountOutExpected: formatUnits(quote.amountOut, tout.token.decimals),
            amountOutMin: formatUnits(amountOutMin, tout.token.decimals),
            status: receipt.status === 'success' ? 'success' : 'reverted',
            // Decision receipt: proof this swap was policy-checked + simulated.
            simGasEstimate: sim.gas.toString(),
            policyEnforced: ctx.policy != null,
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
