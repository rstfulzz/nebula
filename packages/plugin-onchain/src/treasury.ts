/**
 * Treasury aggregation — the unified "what do we hold, and what's it worth"
 * view a treasury manager actually wants: idle (wallet) + deployed (Aave),
 * USD-valued, with the idle/deployed split.
 *
 * The aggregation is a PURE function of (wallet balances, prices, aave) so it
 * is fully unit-testable; the tool layer fetches the inputs (snapshotBalances,
 * DeFiLlama prices, readAaveAccount) and feeds them in.
 */

import type { TokenPrice } from './defillama'

/** Aave V3 getUserAccountData base currency is USD with 8 decimals. */
const AAVE_BASE_USD_DECIMALS = 1e8

export interface WalletAssetIn {
  symbol: string
  /** Lowercase token address, or 'native' for MNT. */
  address: string
  /** Human-formatted amount (e.g. "12.5"). */
  formatted: string
}

export interface AavePositionIn {
  totalCollateralBase: bigint
  totalDebtBase: bigint
  healthFactor: string
}

export interface PricedAsset {
  symbol: string
  address: string
  amount: string
  priceUsd: number | null
  valueUsd: number | null
}

export interface TreasurySummary {
  totalUsd: number
  idle: {
    usd: number
    assets: PricedAsset[]
    /** Assets we hold but couldn't price (no DeFiLlama feed). */
    unpricedSymbols: string[]
  }
  deployed: {
    aave: {
      suppliedUsd: number
      debtUsd: number
      netUsd: number
      healthFactor: string
    } | null
  }
  /** Share of total value sitting idle in the wallet vs deployed, percent. */
  idlePct: number | null
  pricedVia: 'DeFiLlama'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Compose a treasury summary. `nativePriceAddress` is the address whose price
 * proxies native MNT (WMNT). `prices` is keyed by lowercase address.
 */
export function summarizeTreasury(opts: {
  wallet: WalletAssetIn[]
  prices: Record<string, TokenPrice>
  nativePriceAddress: string
  aave?: AavePositionIn | null
}): TreasurySummary {
  const { wallet, prices, nativePriceAddress, aave } = opts
  const assets: PricedAsset[] = []
  const unpriced: string[] = []
  let idleUsd = 0

  for (const a of wallet) {
    const priceKey = a.address === 'native' ? nativePriceAddress.toLowerCase() : a.address.toLowerCase()
    const p = prices[priceKey]
    const amount = Number(a.formatted)
    if (p && Number.isFinite(amount)) {
      const valueUsd = round2(amount * p.price)
      idleUsd += amount * p.price
      assets.push({ symbol: a.symbol, address: a.address, amount: a.formatted, priceUsd: p.price, valueUsd })
    } else {
      assets.push({ symbol: a.symbol, address: a.address, amount: a.formatted, priceUsd: null, valueUsd: null })
      if (amount > 0) unpriced.push(a.symbol)
    }
  }
  assets.sort((x, y) => (y.valueUsd ?? 0) - (x.valueUsd ?? 0))

  let aaveOut: TreasurySummary['deployed']['aave'] = null
  let deployedNet = 0
  if (aave) {
    const suppliedUsd = Number(aave.totalCollateralBase) / AAVE_BASE_USD_DECIMALS
    const debtUsd = Number(aave.totalDebtBase) / AAVE_BASE_USD_DECIMALS
    const netUsd = suppliedUsd - debtUsd
    deployedNet = netUsd
    aaveOut = {
      suppliedUsd: round2(suppliedUsd),
      debtUsd: round2(debtUsd),
      netUsd: round2(netUsd),
      healthFactor: aave.healthFactor,
    }
  }

  const totalUsd = idleUsd + deployedNet
  const idlePct = totalUsd > 0 ? round2((idleUsd / totalUsd) * 100) : null

  return {
    totalUsd: round2(totalUsd),
    idle: { usd: round2(idleUsd), assets, unpricedSymbols: unpriced },
    deployed: { aave: aaveOut },
    idlePct,
    pricedVia: 'DeFiLlama',
  }
}
