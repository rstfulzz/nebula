import { describe, expect, test } from 'bun:test'
import { rayToAprPct } from './aave'

const RAY = 10n ** 27n

describe('rayToAprPct', () => {
  test('converts a RAY-scaled rate to a percentage', () => {
    // 5% APR in RAY = 0.05 * 1e27
    expect(rayToAprPct((5n * RAY) / 100n)).toBeCloseTo(5, 4)
    // ~6.94% (a real WETH supply rate observed on Mantle)
    expect(rayToAprPct((694n * RAY) / 10_000n)).toBeCloseTo(6.94, 2)
  })

  test('zero rate → 0%', () => {
    expect(rayToAprPct(0n)).toBe(0)
  })

  test('keeps 4-decimal precision on small rates', () => {
    // 0.1234% APR
    expect(rayToAprPct((1234n * RAY) / 1_000_000n)).toBeCloseTo(0.1234, 4)
  })
})
