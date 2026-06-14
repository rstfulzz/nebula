/**
 * Token risk assessment — the pre-trade "is this safe to hold or swap into?"
 * read a treasury manager wants before touching an asset.
 *
 * The verdict is a PURE function of signals the tool gathers (price feed,
 * tradeability across venues, liquidity depth, restricted-RWA flag), so the
 * risk rubric is fully unit-testable; the tool layer fetches the signals.
 */

export interface TokenRiskInputs {
  /** False when the symbol/address could not be resolved to a real token. */
  resolved: boolean
  symbol: string
  /** CLAUDE.md restricted product (USDY/MI4/mUSD) — needs eligibility. */
  restricted: boolean
  /** Reference USD price from DeFiLlama, or null when no feed exists. */
  priceUsd: number | null
  /** Human venue labels that returned a live quote (can exit there). */
  tradeableVenues: string[]
  /** Largest DeFiLlama pool TVL the token appears in, or null if none. */
  maxPoolTvlUsd: number | null
  /** True when the address has contract code (not an EOA / typo). */
  isContract: boolean
}

export type RiskLevel = 'low' | 'elevated' | 'high'

export interface TokenRiskVerdict {
  level: RiskLevel
  /** Plain-language reasons behind the level (ordered most → least severe). */
  reasons: string[]
  tradeable: boolean
  priced: boolean
}

const THIN_LIQUIDITY_USD = 50_000

/** Compose a risk verdict from the gathered signals. Pure + deterministic. */
export function assessTokenRisk(i: TokenRiskInputs): TokenRiskVerdict {
  const reasons: string[] = []
  const tradeable = i.tradeableVenues.length > 0
  const priced = i.priceUsd !== null

  if (!i.resolved) {
    return {
      level: 'high',
      reasons: ['could not resolve this token (unknown symbol/address) — do not trade'],
      tradeable: false,
      priced: false,
    }
  }
  if (!i.isContract) {
    reasons.push('address has no contract code (likely a typo or non-token) — do not trade')
  }
  if (!tradeable) {
    reasons.push('no swap route on Agni or Merchant Moe — you could not exit this position')
  }
  if (!priced) {
    reasons.push('no DeFiLlama price feed — illiquid or unrecognized, value is hard to mark')
  }
  if (i.restricted) {
    reasons.push(
      `${i.symbol} is a restricted product (RWA) — confirm eligibility before entering; do not auto-trade`,
    )
  }
  if (i.maxPoolTvlUsd !== null && i.maxPoolTvlUsd < THIN_LIQUIDITY_USD) {
    reasons.push(
      `thin on-chain liquidity (max pool TVL ~$${Math.round(i.maxPoolTvlUsd).toLocaleString()}) — expect slippage and exit risk`,
    )
  }
  if (tradeable && i.tradeableVenues.length === 1) {
    reasons.push(`only one venue (${i.tradeableVenues[0]}) quotes it — concentrated liquidity`)
  }

  // Level: hard blockers → high; soft concerns → elevated; clean → low.
  let level: RiskLevel
  if (!i.isContract || !tradeable) {
    level = 'high'
  } else if (
    i.restricted ||
    !priced ||
    (i.maxPoolTvlUsd !== null && i.maxPoolTvlUsd < THIN_LIQUIDITY_USD)
  ) {
    level = 'elevated'
  } else {
    level = 'low'
    reasons.push('priced, tradeable, and reasonably liquid')
  }

  return { level, reasons, tradeable, priced }
}
