/**
 * `risk.token` — pre-trade risk assessment for any Mantle token. Read-only.
 *
 * Composes the signals a treasury manager checks before holding or swapping
 * into an asset: does it have a price feed, can you actually exit it (a live
 * quote on Agni / Merchant Moe), how deep is its liquidity, is it a restricted
 * RWA, and is the address even a contract. Returns a low/elevated/high verdict
 * with plain-language reasons. Analytics only — moves nothing.
 */

import type { ToolDef } from 'nebula-ai-core'
import { type Address, parseUnits } from 'viem'
import { z } from 'zod'
import { AGNI_BY_NETWORK, MOE_LB_BY_NETWORK } from '../constants'
import {
  type TokenPrice,
  fetchMantlePrices,
  fetchMantleYields,
  isRestrictedAsset,
} from '../defillama'
import { quoteMoe } from '../moe'
import { quoteAcrossTiers } from '../quoter'
import { assessTokenRisk } from '../risk'
import { resolveToken } from '../tokens'
import type { OnchainRuntimeContext } from '../types'

const USDC: Address = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9'

const Schema = z.object({
  token: z.string().min(1).describe('Token symbol or 0x address to assess.'),
})
type Args = z.infer<typeof Schema>

export function makeRiskToken(ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'risk.token',
    description:
      'Assess the risk of holding or swapping into a Mantle token before you act: price feed, tradeability (can you exit it on Agni / Merchant Moe), liquidity depth, restricted-RWA flag, and whether the address is a real contract. Returns a low/elevated/high verdict with reasons. Read-only analytics — call it before proposing a buy/supply into an unfamiliar token.',
    searchHint:
      'risk token assess safe rug honeypot liquidity tradeable exit restricted rwa due diligence vet',
    schema: Schema,
    handler: async (args: Args) => {
      try {
        const wmnt = AGNI_BY_NETWORK[ctx.network]?.weth9 as Address | undefined
        const moe = MOE_LB_BY_NETWORK[ctx.network]
        const token = await resolveToken({
          client: ctx.publicClient,
          agentDir: ctx.agentDir,
          input: args.token,
        })
        if (!token) {
          const v = assessTokenRisk({
            resolved: false,
            symbol: args.token,
            restricted: false,
            priceUsd: null,
            tradeableVenues: [],
            maxPoolTvlUsd: null,
            isContract: false,
          })
          return { ok: true, data: { token: args.token, ...v } }
        }

        // Reference asset for the tradeability probe (avoid self-pairing).
        // Agni + Merchant Moe are mainnet-only, so the venue probes run there.
        const mainnet = ctx.network === 'mantle-mainnet'
        const ref = token.address.toLowerCase() === USDC.toLowerCase() ? wmnt : USDC
        const isReference =
          token.address.toLowerCase() === USDC.toLowerCase() ||
          (wmnt && token.address.toLowerCase() === wmnt.toLowerCase())
        const amountIn = parseUnits('1', token.decimals)

        const [code, prices, yields, agni, moeQ] = await Promise.all([
          ctx.publicClient.getBytecode({ address: token.address }).catch(() => undefined),
          fetchMantlePrices([token.address]).catch(() => ({}) as Record<string, TokenPrice>),
          fetchMantleYields({ minTvlUsd: 0, sortBy: 'tvl', limit: 50 }).catch(() => []),
          mainnet && ref
            ? quoteAcrossTiers({
                client: ctx.publicClient,
                network: 'mantle-mainnet',
                tokenIn: token.address,
                tokenOut: ref,
                amountIn,
              }).catch(() => null)
            : Promise.resolve(null),
          mainnet && ref && moe
            ? quoteMoe({
                client: ctx.publicClient,
                quoter: moe.quoter as Address,
                route: [token.address, ref],
                amountIn,
              }).catch(() => null)
            : Promise.resolve(null),
        ])

        const tradeableVenues: string[] = []
        if (isReference) {
          tradeableVenues.push('reference asset (deep liquidity)')
        } else {
          if (agni) tradeableVenues.push('Agni Finance')
          if (moeQ) tradeableVenues.push('Merchant Moe')
        }

        const priceUsd = prices[token.address.toLowerCase()]?.price ?? null
        const sym = token.symbol.toUpperCase()
        const maxPoolTvlUsd =
          yields
            .filter(p => p.symbol.toUpperCase().includes(sym))
            .reduce((mx, p) => Math.max(mx, p.tvlUsd), 0) || null

        const verdict = assessTokenRisk({
          resolved: true,
          symbol: token.symbol,
          restricted: isRestrictedAsset(token.symbol, ''),
          priceUsd,
          tradeableVenues,
          maxPoolTvlUsd,
          isContract: !!code && code !== '0x',
        })

        return {
          ok: true,
          data: {
            token: token.symbol,
            address: token.address,
            priceUsd,
            tradeableVenues,
            maxPoolTvlUsd,
            restricted: isRestrictedAsset(token.symbol, ''),
            ...verdict,
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
