/**
 * `swap.compare` + `swap.best` — multi-venue best execution across Agni and
 * Merchant Moe.
 *
 * `swap.compare` (read-only) quotes the same trade on both DEXes and reports
 * which returns more output. `swap.best` does the same, then EXECUTES on the
 * winning venue by delegating to that venue's existing tool — so the trade runs
 * through the identical policy -> simulate -> (approval) -> execute pipeline and
 * decision receipt, with no duplicated execution path.
 */

import type { ToolDef } from 'nebula-ai-core'
import { type Address, formatUnits, parseUnits } from 'viem'
import { z } from 'zod'
import { AGNI_BY_NETWORK, MOE_LB_BY_NETWORK, requireMainnet } from '../constants'
import { quoteMoe } from '../moe'
import { type PricedToken, resolveUsdPrices } from '../pricing'
import { quoteAcrossTiers } from '../quoter'
import { isNativeToken, resolveToken } from '../tokens'
import type { OnchainRuntimeContext } from '../types'
import { makeMoeSwap } from './moe'
import { makeSwapExecute } from './swap'

interface Resolved {
  address: Address
  decimals: number
  symbol: string
  isNative: boolean
}

async function resolve(ctx: OnchainRuntimeContext, input: string): Promise<Resolved | null> {
  if (isNativeToken(input)) {
    return {
      address: AGNI_BY_NETWORK[ctx.network]!.weth9 as Address,
      decimals: 18,
      symbol: 'WMNT',
      isNative: true,
    }
  }
  const t = await resolveToken({ client: ctx.publicClient, agentDir: ctx.agentDir, input })
  if (!t) return null
  return { address: t.address, decimals: t.decimals, symbol: t.symbol, isNative: false }
}

const Schema = z.object({
  tokenIn: z.string().describe('Input token: symbol, 0x address, or "MNT"/"native".'),
  tokenOut: z.string().describe('Output token: symbol, 0x address, or "MNT"/"native".'),
  amountIn: z.string().describe('Input amount in tokenIn units (e.g. "1.5").'),
  slippageBps: z.number().int().nonnegative().max(10000).optional(),
})
type Args = z.infer<typeof Schema>

export interface VenueQuote {
  venue: 'agni' | 'moe'
  amountOutRaw: bigint
  amountOut: string
  /** Execution shortfall vs the free reference price, percent (null if unpriced). */
  priceImpactPct?: number | null
}

/** Price-impact warning fires above this many percent of execution shortfall. */
export const HIGH_PRICE_IMPACT_PCT = 2

/**
 * Pure: execution shortfall of a quote vs fair value (reference USD prices).
 * fairOut = amountIn * priceIn / priceOut; impact = (fairOut - amountOut)/fairOut.
 * Returns null when inputs are missing/zero; clamps negatives (better-than-fair) to 0.
 */
export function priceImpactPct(
  amountIn: number,
  priceIn: number | null,
  priceOut: number | null,
  amountOut: number,
): number | null {
  if (!priceIn || !priceOut || !(amountIn > 0) || priceIn <= 0 || priceOut <= 0) return null
  const fairOut = (amountIn * priceIn) / priceOut
  if (!(fairOut > 0)) return null
  const impact = ((fairOut - amountOut) / fairOut) * 100
  return Math.max(0, Math.round(impact * 100) / 100)
}

export interface RankedQuotes {
  sorted: VenueQuote[]
  best: VenueQuote
  /** Output edge of the best venue over the worst, percent (null if one venue). */
  edgePct: number | null
}

/** Pure: rank venue quotes by output desc and compute the best-vs-worst edge. */
export function rankVenueQuotes(quotes: VenueQuote[]): RankedQuotes | null {
  if (quotes.length === 0) return null
  const sorted = [...quotes].sort((a, b) =>
    b.amountOutRaw > a.amountOutRaw ? 1 : b.amountOutRaw < a.amountOutRaw ? -1 : 0,
  )
  const best = sorted[0]!
  const worst = sorted[sorted.length - 1]!
  const edgePct =
    sorted.length > 1 && worst.amountOutRaw > 0n
      ? Number(((best.amountOutRaw - worst.amountOutRaw) * 10000n) / worst.amountOutRaw) / 100
      : null
  return { sorted, best, edgePct }
}

async function quoteVenues(
  ctx: OnchainRuntimeContext,
  args: Args,
): Promise<
  | { ok: false; error: string }
  | {
      ok: true
      tokenIn: string
      tokenOut: string
      decimalsOut: number
      quotes: VenueQuote[]
    }
> {
  requireMainnet(ctx.network)
  const tin = await resolve(ctx, args.tokenIn)
  const tout = await resolve(ctx, args.tokenOut)
  if (!tin) return { ok: false, error: `unknown tokenIn: ${args.tokenIn}` }
  if (!tout) return { ok: false, error: `unknown tokenOut: ${args.tokenOut}` }
  const amountInWei = parseUnits(args.amountIn, tin.decimals)
  const moe = MOE_LB_BY_NETWORK[ctx.network]!

  const [agni, moeQ] = await Promise.all([
    quoteAcrossTiers({
      client: ctx.publicClient,
      network: ctx.network,
      tokenIn: tin.address,
      tokenOut: tout.address,
      amountIn: amountInWei,
    }).catch(() => null),
    quoteMoe({
      client: ctx.publicClient,
      quoter: moe.quoter as Address,
      route: [tin.address, tout.address],
      amountIn: amountInWei,
    }).catch(() => null),
  ])

  const quotes: VenueQuote[] = []
  if (agni)
    quotes.push({
      venue: 'agni',
      amountOutRaw: agni.amountOut,
      amountOut: formatUnits(agni.amountOut, tout.decimals),
    })
  if (moeQ)
    quotes.push({
      venue: 'moe',
      amountOutRaw: moeQ.amountOut,
      amountOut: formatUnits(moeQ.amountOut, tout.decimals),
    })
  if (quotes.length === 0)
    return {
      ok: false,
      error: `no liquidity on Agni or Merchant Moe for ${tin.symbol}→${tout.symbol}`,
    }

  // Price impact: compare each quote to fair value from the free reference price
  // (DeFiLlama + on-chain fallback). Best-effort — null when a token is unpriced.
  const wmnt = AGNI_BY_NETWORK[ctx.network]?.weth9 as Address | undefined
  const priced = await resolveUsdPrices({
    client: ctx.publicClient,
    mainnet: true,
    tokens: [
      { address: tin.address, symbol: tin.symbol, decimals: tin.decimals },
      { address: tout.address, symbol: tout.symbol, decimals: tout.decimals },
    ],
    wmnt,
  }).catch(() => ({}) as Record<string, PricedToken>)
  const priceIn = priced[tin.address.toLowerCase()]?.priceUsd ?? null
  const priceOut = priced[tout.address.toLowerCase()]?.priceUsd ?? null
  const amountInHuman = Number(args.amountIn)
  for (const q of quotes) {
    q.priceImpactPct = priceImpactPct(amountInHuman, priceIn, priceOut, Number(q.amountOut))
  }

  return {
    ok: true,
    tokenIn: tin.symbol,
    tokenOut: tout.symbol,
    decimalsOut: tout.decimals,
    quotes,
  }
}

function venueLabel(v: 'agni' | 'moe'): string {
  return v === 'agni' ? 'Agni Finance' : 'Merchant Moe (Liquidity Book)'
}

export function makeSwapCompare(ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'swap.compare',
    description:
      'Compare a swap across both DEX venues (Agni + Merchant Moe) and report which returns more output. Read-only. Use before a non-trivial swap, or call swap.best to compare AND execute on the winner in one step.',
    searchHint: 'swap compare best execution venue route agni moe which dex better price quote',
    schema: Schema,
    handler: async (args: Args) => {
      try {
        const r = await quoteVenues(ctx, args)
        if (!r.ok) return { ok: false, error: r.error }
        const ranked = rankVenueQuotes(r.quotes)!
        const bestImpact = ranked.best.priceImpactPct ?? null
        return {
          ok: true,
          data: {
            tokenIn: r.tokenIn,
            tokenOut: r.tokenOut,
            amountIn: args.amountIn,
            best: {
              venue: venueLabel(ranked.best.venue),
              amountOut: ranked.best.amountOut,
              priceImpactPct: bestImpact,
            },
            quotes: ranked.sorted.map(q => ({
              venue: venueLabel(q.venue),
              amountOut: q.amountOut,
              priceImpactPct: q.priceImpactPct ?? null,
            })),
            bestEdgePct: ranked.edgePct,
            ...(bestImpact !== null && bestImpact >= HIGH_PRICE_IMPACT_PCT
              ? {
                  warning: `high price impact: this trade executes ~${bestImpact}% below fair value (thin liquidity for this size) — consider a smaller amount`,
                }
              : {}),
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}

export function makeSwapBest(ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'swap.best',
    description:
      'Best execution: quote the swap on BOTH Agni and Merchant Moe, then execute on whichever returns more output. Runs the winning venue through the full policy -> simulate -> (approval) -> execute pipeline. One call instead of quoting both venues by hand.',
    searchHint: 'swap best execution auto route smart order router agni moe trade exchange optimal',
    schema: Schema,
    handler: async (args: Args) => {
      try {
        const r = await quoteVenues(ctx, args)
        if (!r.ok) return { ok: false, error: r.error }
        const ranked = rankVenueQuotes(r.quotes)!
        // Delegate execution to the winning venue's existing tool: same args,
        // same policy/simulate/approval/receipt pipeline (re-quotes at exec).
        const executor = ranked.best.venue === 'agni' ? makeSwapExecute(ctx) : makeMoeSwap(ctx)
        const exec = await executor.handler(args)
        if (!exec.ok) return exec
        const bestImpact = ranked.best.priceImpactPct ?? null
        return {
          ok: true,
          data: {
            routedTo: venueLabel(ranked.best.venue),
            priceImpactPct: bestImpact,
            comparedQuotes: ranked.sorted.map(q => ({
              venue: venueLabel(q.venue),
              amountOut: q.amountOut,
              priceImpactPct: q.priceImpactPct ?? null,
            })),
            ...(bestImpact !== null && bestImpact >= HIGH_PRICE_IMPACT_PCT
              ? {
                  warning: `executed with ~${bestImpact}% price impact (thin liquidity for this size)`,
                }
              : {}),
            ...(exec.data as Record<string, unknown>),
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
