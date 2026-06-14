/**
 * `treasury.summary` — unified treasury position: idle (wallet) + deployed
 * (Aave), USD-valued via DeFiLlama, with the idle/deployed split. Read-only.
 *
 * Composes snapshotBalances (wallet) + fetchMantlePrices (USD) + readAaveAccount
 * (deployed) into the one number a treasury manager asks for first: total value,
 * and where it is.
 */

import type { ToolDef } from 'nebula-ai-core'
import type { Address } from 'viem'
import { z } from 'zod'
import { formatHealthFactor, readAaveAccount } from '../aave'
import { snapshotBalances } from '../balances'
import { AAVE_POOL_BY_NETWORK, AGNI_BY_NETWORK } from '../constants'
import type { TokenPrice } from '../defillama'
import { resolveUsdPrices } from '../pricing'
import { type WalletAssetIn, summarizeTreasury } from '../treasury'
import type { OnchainRuntimeContext } from '../types'

const Schema = z.object({})
type Args = z.infer<typeof Schema>

export function makeTreasurySummary(ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'treasury.summary',
    description:
      'Unified treasury position in USD: idle wallet holdings (native MNT + ERC-20s) plus funds deployed in Aave, with per-asset USD values and the idle-vs-deployed split. Read-only; prices via DeFiLlama with an on-chain Agni-quote fallback (both free, no key). Call this for "what are we worth", "full treasury", "how much is deployed vs idle", "portfolio".',
    searchHint:
      'treasury portfolio total value usd net worth position idle deployed aave holdings worth',
    schema: Schema,
    handler: async () => {
      try {
        const snap = await snapshotBalances({
          client: ctx.publicClient,
          agentDir: ctx.agentDir,
          address: ctx.agentEoa,
          mintBlock: ctx.mintBlock,
        })

        const wallet: WalletAssetIn[] = [
          { symbol: 'MNT', address: 'native', formatted: snap.native.formatted },
          ...snap.tokens.map(t => ({
            symbol: t.symbol,
            address: t.address,
            formatted: t.formatted,
          })),
        ]

        // WMNT proxies the native MNT price. Price via DeFiLlama (free REST),
        // then fall back to an on-chain Agni quote for anything it doesn't list
        // — so any *tradeable* token still gets valued, with no API key.
        const wmnt = AGNI_BY_NETWORK[ctx.network]?.weth9 as Address | undefined
        const toPrice = [
          ...(wmnt ? [{ address: wmnt, symbol: 'WMNT', decimals: 18 }] : []),
          ...snap.tokens
            .filter(t => Number(t.formatted) > 0)
            .map(t => ({ address: t.address, symbol: t.symbol, decimals: t.decimals })),
        ]
        const priced = await resolveUsdPrices({
          client: ctx.publicClient,
          mainnet: ctx.network === 'mantle-mainnet',
          tokens: toPrice,
          wmnt,
        })
        const prices: Record<string, TokenPrice> = {}
        for (const [k, v] of Object.entries(priced)) {
          prices[k] = { price: v.priceUsd, symbol: v.symbol, decimals: v.decimals }
        }
        const pricedOnchain = Object.values(priced)
          .filter(p => p.source === 'onchain')
          .map(p => p.symbol)

        // Deployed: Aave (mainnet only).
        const aavePool = AAVE_POOL_BY_NETWORK[ctx.network]
        let aave: Parameters<typeof summarizeTreasury>[0]['aave'] = null
        if (aavePool) {
          const acct = await readAaveAccount(ctx.publicClient, aavePool, ctx.agentEoa).catch(
            () => null,
          )
          if (acct && (acct.totalCollateralBase > 0n || acct.totalDebtBase > 0n)) {
            aave = {
              totalCollateralBase: acct.totalCollateralBase,
              totalDebtBase: acct.totalDebtBase,
              healthFactor: formatHealthFactor(acct.healthFactorRaw),
            }
          }
        }

        const summary = summarizeTreasury({
          wallet,
          prices,
          nativePriceAddress: (wmnt ?? '0x') as Address,
          aave,
        })
        return {
          ok: true,
          data: {
            ...summary,
            pricedOnchain: pricedOnchain.length > 0 ? pricedOnchain : undefined,
            pricedVia: 'DeFiLlama + on-chain Agni fallback',
            agentEoa: ctx.agentEoa,
            network: ctx.network,
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
