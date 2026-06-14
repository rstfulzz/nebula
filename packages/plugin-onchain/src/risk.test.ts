import { describe, expect, test } from 'bun:test'
import { type TokenRiskInputs, assessTokenRisk } from './risk'

const base: TokenRiskInputs = {
  resolved: true,
  symbol: 'USDC',
  restricted: false,
  priceUsd: 1.0,
  tradeableVenues: ['Agni Finance', 'Merchant Moe'],
  maxPoolTvlUsd: 2_800_000,
  isContract: true,
}

describe('assessTokenRisk', () => {
  test('clean blue-chip → low', () => {
    const v = assessTokenRisk(base)
    expect(v.level).toBe('low')
    expect(v.tradeable).toBe(true)
    expect(v.priced).toBe(true)
  })

  test('unresolved token → high, do-not-trade', () => {
    const v = assessTokenRisk({ ...base, resolved: false })
    expect(v.level).toBe('high')
    expect(v.reasons[0]).toMatch(/could not resolve/)
  })

  test('untradeable (no venue route) → high (cannot exit)', () => {
    const v = assessTokenRisk({ ...base, tradeableVenues: [] })
    expect(v.level).toBe('high')
    expect(v.reasons.some(r => /could not exit/.test(r))).toBe(true)
  })

  test('non-contract address → high', () => {
    const v = assessTokenRisk({ ...base, isContract: false })
    expect(v.level).toBe('high')
    expect(v.reasons.some(r => /no contract code/.test(r))).toBe(true)
  })

  test('restricted RWA → elevated with eligibility reason', () => {
    const v = assessTokenRisk({ ...base, symbol: 'USDY', restricted: true })
    expect(v.level).toBe('elevated')
    expect(v.reasons.some(r => /restricted/.test(r))).toBe(true)
  })

  test('thin liquidity → elevated', () => {
    const v = assessTokenRisk({ ...base, maxPoolTvlUsd: 10_000 })
    expect(v.level).toBe('elevated')
    expect(v.reasons.some(r => /thin on-chain liquidity/.test(r))).toBe(true)
  })

  test('no price feed → elevated', () => {
    const v = assessTokenRisk({ ...base, priceUsd: null })
    expect(v.level).toBe('elevated')
    expect(v.priced).toBe(false)
  })

  test('single-venue liquidity is flagged but not by itself high', () => {
    const v = assessTokenRisk({ ...base, tradeableVenues: ['Agni Finance'] })
    expect(v.level).toBe('low')
    expect(v.reasons.some(r => /only one venue/.test(r))).toBe(true)
  })
})
