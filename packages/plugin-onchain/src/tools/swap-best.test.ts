import { describe, expect, test } from 'bun:test'
import { type VenueQuote, priceImpactPct, rankVenueQuotes } from './swap-best'

describe('priceImpactPct', () => {
  test('quote far below fair value reports the shortfall', () => {
    // 1000 USDC in at $1, out token at $1 → fair 1000; got 950 → 5% impact
    expect(priceImpactPct(1000, 1, 1, 950)).toBeCloseTo(5, 4)
  })
  test('quote at/above fair value clamps to 0', () => {
    expect(priceImpactPct(1000, 1, 1, 1000)).toBe(0)
    expect(priceImpactPct(1000, 1, 1, 1010)).toBe(0)
  })
  test('cross-price: 5 MNT @ $0.55 -> USDC @ $1, fair 2.75; got 2.72 -> ~1.1%', () => {
    const impact = priceImpactPct(5, 0.55, 1, 2.72)!
    expect(impact).toBeGreaterThan(0)
    expect(impact).toBeLessThan(3)
  })
  test('null when a token is unpriced', () => {
    expect(priceImpactPct(1000, null, 1, 950)).toBeNull()
    expect(priceImpactPct(1000, 1, 0, 950)).toBeNull()
  })
})

// The end-to-end path (quote both venues live + delegate execution) is verified
// against mainnet; here we unit-test the pure venue-ranking + edge math, which
// is what decides where a trade routes.

const agni = (raw: bigint, fmt: string): VenueQuote => ({
  venue: 'agni',
  amountOutRaw: raw,
  amountOut: fmt,
})
const moe = (raw: bigint, fmt: string): VenueQuote => ({
  venue: 'moe',
  amountOutRaw: raw,
  amountOut: fmt,
})

describe('rankVenueQuotes', () => {
  test('returns null for an empty set', () => {
    expect(rankVenueQuotes([])).toBeNull()
  })

  test('ranks the higher-output venue first and computes the edge', () => {
    // Moe 0.6 vs Agni 0.5 → Moe wins, edge = (0.6-0.5)/0.5 = 20%
    const r = rankVenueQuotes([agni(500000n, '0.5'), moe(600000n, '0.6')])!
    expect(r.best.venue).toBe('moe')
    expect(r.sorted.map(q => q.venue)).toEqual(['moe', 'agni'])
    expect(r.edgePct).toBeCloseTo(20, 6)
  })

  test('agni wins when it returns more', () => {
    // Agni 2.764977 vs Moe 2.720912 (real mainnet 5 MNT->USDC numbers)
    const r = rankVenueQuotes([agni(2_764977n, '2.764977'), moe(2_720912n, '2.720912')])!
    expect(r.best.venue).toBe('agni')
    expect(r.edgePct).toBeGreaterThan(0)
    expect(r.edgePct).toBeLessThan(5)
  })

  test('single venue → no edge', () => {
    const r = rankVenueQuotes([moe(600000n, '0.6')])!
    expect(r.best.venue).toBe('moe')
    expect(r.edgePct).toBeNull()
  })

  test('a tie keeps both and reports 0% edge', () => {
    const r = rankVenueQuotes([agni(500000n, '0.5'), moe(500000n, '0.5')])!
    expect(r.edgePct).toBe(0)
    expect(r.sorted.length).toBe(2)
  })
})
