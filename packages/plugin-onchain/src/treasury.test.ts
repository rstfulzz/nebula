import { describe, expect, test } from 'bun:test'
import { fetchMantlePrices } from './defillama'
import { summarizeTreasury } from './treasury'

const WMNT = '0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8'
const USDC = '0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9'
const SHADY = '0x000000000000000000000000000000000000dead'

const PRICES = {
  [WMNT]: { price: 0.5, symbol: 'WMNT', decimals: 18 },
  [USDC]: { price: 1.0, symbol: 'USDC', decimals: 6 },
}

describe('summarizeTreasury', () => {
  test('values idle wallet + prices native MNT off WMNT', () => {
    const s = summarizeTreasury({
      wallet: [
        { symbol: 'MNT', address: 'native', formatted: '10' }, // 10 * 0.5 = 5
        { symbol: 'USDC', address: USDC, formatted: '20' }, // 20 * 1 = 20
      ],
      prices: PRICES,
      nativePriceAddress: WMNT,
    })
    expect(s.idle.usd).toBe(25)
    expect(s.totalUsd).toBe(25)
    expect(s.deployed.aave).toBeNull()
    expect(s.idlePct).toBe(100)
    // sorted by value desc → USDC (20) first
    expect(s.idle.assets[0]?.symbol).toBe('USDC')
  })

  test('tracks unpriced holdings without crashing the total', () => {
    const s = summarizeTreasury({
      wallet: [
        { symbol: 'USDC', address: USDC, formatted: '20' },
        { symbol: 'SHADY', address: SHADY, formatted: '1000' },
      ],
      prices: PRICES,
      nativePriceAddress: WMNT,
    })
    expect(s.idle.usd).toBe(20)
    expect(s.idle.unpricedSymbols).toContain('SHADY')
    const shady = s.idle.assets.find(a => a.symbol === 'SHADY')
    expect(shady?.valueUsd).toBeNull()
  })

  test('folds in Aave deployed net (collateral - debt) and computes the split', () => {
    const s = summarizeTreasury({
      wallet: [{ symbol: 'USDC', address: USDC, formatted: '100' }], // 100 idle
      prices: PRICES,
      nativePriceAddress: WMNT,
      aave: {
        totalCollateralBase: 300n * 10n ** 8n, // $300 supplied
        totalDebtBase: 100n * 10n ** 8n, // $100 borrowed
        healthFactor: '2.5',
      },
    })
    expect(s.deployed.aave?.suppliedUsd).toBe(300)
    expect(s.deployed.aave?.debtUsd).toBe(100)
    expect(s.deployed.aave?.netUsd).toBe(200)
    // total = 100 idle + 200 net deployed = 300; idle share = 100/300 = 33.33%
    expect(s.totalUsd).toBe(300)
    expect(s.idlePct).toBeCloseTo(33.33, 1)
  })
})

describe('fetchMantlePrices', () => {
  test('parses coins map keyed by lowercase address', async () => {
    const fake = (async () =>
      new Response(
        JSON.stringify({
          coins: {
            [`mantle:${WMNT}`]: { price: 0.557, symbol: 'WMNT', decimals: 18, confidence: 0.99 },
            [`mantle:${USDC}`]: { price: 1.0003, symbol: 'USDC', decimals: 6, confidence: 0.99 },
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch
    const out = await fetchMantlePrices([WMNT, USDC], fake)
    expect(out[WMNT]?.price).toBeCloseTo(0.557, 4)
    expect(out[USDC]?.symbol).toBe('USDC')
  })

  test('empty address list short-circuits without a request', async () => {
    const out = await fetchMantlePrices([])
    expect(out).toEqual({})
  })

  test('throws on non-200', async () => {
    const fake = (async () => new Response('x', { status: 502 })) as unknown as typeof fetch
    await expect(fetchMantlePrices([WMNT], fake)).rejects.toThrow(/DeFiLlama prices API 502/)
  })
})
