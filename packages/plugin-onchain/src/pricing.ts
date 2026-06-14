/**
 * Token USD pricing with two FREE sources, no API key:
 *   1. DeFiLlama public REST (`coins.llama.fi`) — broad, includes confidence.
 *   2. On-chain DEX quote (Agni: 1 token -> USDC) — works for ANY tradeable
 *      token, pure Mantle RPC, no external dependency or rate limit.
 *
 * `resolveUsdPrices` prefers DeFiLlama and falls back on-chain, so a token the
 * aggregator doesn't list still gets valued as long as it can be sold.
 */

import type { Address, PublicClient } from 'viem'
import { type TokenPrice, fetchMantlePrices } from './defillama'
import { quoteAcrossTiers } from './quoter'

/** Native USDC on Mantle (6 decimals) — the USD reference for on-chain quotes. */
const USDC: Address = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9'
const USDC_DECIMALS = 6

export interface PricedToken {
  address: string
  symbol: string
  decimals: number
  priceUsd: number
  source: 'defillama' | 'onchain'
}

/**
 * Derive a token's USD price from an Agni quote (mainnet only). Tries a direct
 * 1-token -> USDC quote first; if there's no USDC pool, bridges through WMNT
 * (1-token -> WMNT) x WMNT's USD price — most Mantle tokens pair with WMNT.
 */
export async function onchainUsdPrice(opts: {
  client: PublicClient
  token: Address
  decimals: number
  wmnt?: Address
  wmntUsd?: number
}): Promise<number | null> {
  const { client, token, decimals, wmnt, wmntUsd } = opts
  if (token.toLowerCase() === USDC.toLowerCase()) return 1
  const amountIn = 10n ** BigInt(decimals) // exactly 1 token

  const toUsdc = await quoteAcrossTiers({
    client,
    network: 'mantle-mainnet',
    tokenIn: token,
    tokenOut: USDC,
    amountIn,
  }).catch(() => null)
  if (toUsdc && toUsdc.amountOut > 0n) return Number(toUsdc.amountOut) / 10 ** USDC_DECIMALS

  // Bridge via WMNT (the deepest pair on Mantle).
  if (wmnt && wmntUsd && token.toLowerCase() !== wmnt.toLowerCase()) {
    const toWmnt = await quoteAcrossTiers({
      client,
      network: 'mantle-mainnet',
      tokenIn: token,
      tokenOut: wmnt,
      amountIn,
    }).catch(() => null)
    if (toWmnt && toWmnt.amountOut > 0n) return (Number(toWmnt.amountOut) / 1e18) * wmntUsd
  }
  return null
}

/**
 * Price a set of tokens: DeFiLlama first, on-chain fallback for the rest.
 * `mainnet` gates the on-chain fallback (Agni is mainnet-only). Returns a map
 * keyed by lowercase address.
 */
export async function resolveUsdPrices(opts: {
  client: PublicClient
  mainnet: boolean
  tokens: { address: Address; symbol: string; decimals: number }[]
  /** WMNT address — enables the on-chain WMNT-bridge fallback. */
  wmnt?: Address
  /** Cap on the on-chain fallback quotes to bound RPC load. Default 8. */
  maxOnchain?: number
}): Promise<Record<string, PricedToken>> {
  const { client, mainnet, tokens, wmnt } = opts
  const out: Record<string, PricedToken> = {}
  if (tokens.length === 0) return out

  // Always include WMNT in the price fetch so the on-chain bridge has its USD anchor.
  const fetchAddrs = [...tokens.map(t => t.address), ...(wmnt ? [wmnt] : [])]
  const llama = await fetchMantlePrices(fetchAddrs).catch(() => ({}) as Record<string, TokenPrice>)
  const wmntUsd = wmnt ? llama[wmnt.toLowerCase()]?.price : undefined
  const needOnchain: typeof tokens = []
  for (const t of tokens) {
    const key = t.address.toLowerCase()
    const p = llama[key]
    if (p) {
      out[key] = {
        address: key,
        symbol: t.symbol,
        decimals: t.decimals,
        priceUsd: p.price,
        source: 'defillama',
      }
    } else {
      needOnchain.push(t)
    }
  }

  if (mainnet && needOnchain.length > 0) {
    const cap = opts.maxOnchain ?? 8
    const slice = needOnchain.slice(0, cap)
    const quoted = await Promise.all(
      slice.map(async t => ({
        t,
        price: await onchainUsdPrice({
          client,
          token: t.address,
          decimals: t.decimals,
          wmnt,
          wmntUsd,
        }).catch(() => null),
      })),
    )
    for (const { t, price } of quoted) {
      if (price !== null) {
        const key = t.address.toLowerCase()
        out[key] = {
          address: key,
          symbol: t.symbol,
          decimals: t.decimals,
          priceUsd: price,
          source: 'onchain',
        }
      }
    }
  }
  return out
}
