/**
 * `tokens.price` — current USD price of a token, from two FREE sources:
 * DeFiLlama public REST first, then an on-chain Agni quote to USDC. No API key.
 */

import type { ToolDef } from 'nebula-ai-core'
import type { Address } from 'viem'
import { z } from 'zod'
import { AGNI_BY_NETWORK } from '../constants'
import { resolveUsdPrices } from '../pricing'
import { resolveToken } from '../tokens'
import type { OnchainRuntimeContext } from '../types'

const Schema = z.object({
  token: z.string().min(1).describe('Token symbol or 0x address to price.'),
})
type Args = z.infer<typeof Schema>

export function makeTokenPrice(ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'tokens.price',
    description:
      'Current USD price of a token, free + no key: DeFiLlama public API first, then an on-chain Agni quote (1 token -> USDC) as fallback so any tradeable token is priced. Read-only. Reports which source was used.',
    searchHint: 'token price usd value quote worth how much is cost rate defillama onchain',
    schema: Schema,
    handler: async (args: Args) => {
      try {
        const token = await resolveToken({
          client: ctx.publicClient,
          agentDir: ctx.agentDir,
          input: args.token,
        })
        if (!token) return { ok: false, error: `unknown token: ${args.token}` }
        const priced = await resolveUsdPrices({
          client: ctx.publicClient,
          mainnet: ctx.network === 'mantle-mainnet',
          tokens: [
            { address: token.address as Address, symbol: token.symbol, decimals: token.decimals },
          ],
          wmnt: AGNI_BY_NETWORK[ctx.network]?.weth9 as Address | undefined,
        })
        const p = priced[token.address.toLowerCase()]
        if (!p) {
          return {
            ok: true,
            data: {
              token: token.symbol,
              address: token.address,
              priceUsd: null,
              note: 'No DeFiLlama feed and no on-chain Agni route — unpriceable (illiquid/unknown).',
            },
          }
        }
        return {
          ok: true,
          data: {
            token: token.symbol,
            address: token.address,
            priceUsd: p.priceUsd,
            source: p.source === 'onchain' ? 'on-chain Agni quote' : 'DeFiLlama',
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
