import { describe, expect, it } from 'bun:test'
import { AAVE_MAX_WITHDRAW, formatBaseUsd, formatHealthFactor } from './aave'

describe('aave formatters', () => {
  it('renders a no-debt (max) health factor as infinity', () => {
    expect(formatHealthFactor(AAVE_MAX_WITHDRAW)).toContain('∞')
  })

  it('renders a 1e18-scaled health factor to 2 dp', () => {
    expect(formatHealthFactor(1_850_000_000_000_000_000n)).toBe('1.85')
    expect(formatHealthFactor(1_000_000_000_000_000_000n)).toBe('1.00')
  })

  it('renders base USD (8 decimals)', () => {
    expect(formatBaseUsd(12_345_000_000n)).toBe('$123.45')
    expect(formatBaseUsd(0n)).toBe('$0.00')
  })
})
