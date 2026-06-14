import { describe, expect, test } from 'bun:test'
import { fetchMantleYields, isRestrictedAsset } from './defillama'

function fakeFetch(pools: unknown[]): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ status: 'success', data: pools }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
}

const SAMPLE = [
  {
    chain: 'Mantle',
    project: 'aave-v3',
    symbol: 'USDC',
    pool: 'a',
    tvlUsd: 2_800_000,
    apy: 5.33,
    stablecoin: true,
    ilRisk: 'no',
    exposure: 'single',
  },
  {
    chain: 'Mantle',
    project: 'agni',
    symbol: 'WMNT-USDC',
    pool: 'b',
    tvlUsd: 900_000,
    apy: 18.4,
    stablecoin: false,
    ilRisk: 'yes',
    exposure: 'multi',
  },
  {
    chain: 'Mantle',
    project: 'ondo-yield-assets',
    symbol: 'USDY',
    pool: 'c',
    tvlUsd: 29_000_000,
    apy: 3.55,
    stablecoin: true,
    ilRisk: 'no',
    exposure: 'single',
  },
  {
    chain: 'Mantle',
    project: 'dust',
    symbol: 'XYZ',
    pool: 'd',
    tvlUsd: 1_000,
    apy: 999,
    stablecoin: false,
    ilRisk: 'yes',
    exposure: 'multi',
  },
  {
    chain: 'Ethereum',
    project: 'aave-v3',
    symbol: 'USDC',
    pool: 'e',
    tvlUsd: 9_000_000,
    apy: 4,
    stablecoin: true,
    ilRisk: 'no',
    exposure: 'single',
  },
]

describe('isRestrictedAsset', () => {
  test('flags USDY / MI4 / mUSD, not plain stablecoins', () => {
    expect(isRestrictedAsset('USDY', 'ondo-yield-assets')).toBe(true)
    expect(isRestrictedAsset('MI4', 'mantle')).toBe(true)
    expect(isRestrictedAsset('mUSD', 'meth')).toBe(true)
    expect(isRestrictedAsset('USDC', 'aave-v3')).toBe(false)
    expect(isRestrictedAsset('WMNT', 'agni')).toBe(false)
  })
})

describe('fetchMantleYields', () => {
  test('filters to Mantle and drops dust below minTvl', async () => {
    const out = await fetchMantleYields({ fetchImpl: fakeFetch(SAMPLE) })
    // Ethereum row excluded; dust (1k < 50k default) excluded.
    expect(out.every(p => p.symbol !== 'XYZ')).toBe(true)
    expect(out.length).toBe(3)
  })

  test('sorts by APY desc by default', async () => {
    const out = await fetchMantleYields({ fetchImpl: fakeFetch(SAMPLE) })
    expect(out[0]?.project).toBe('agni') // 18.4% is highest among kept pools
    expect(out[0]?.apy).toBe(18.4)
  })

  test('sortBy tvl ranks by TVL', async () => {
    const out = await fetchMantleYields({ sortBy: 'tvl', fetchImpl: fakeFetch(SAMPLE) })
    expect(out[0]?.symbol).toBe('USDY') // 29M is highest TVL
  })

  test('stableOnly drops the LP pool', async () => {
    const out = await fetchMantleYields({ stableOnly: true, fetchImpl: fakeFetch(SAMPLE) })
    expect(out.every(p => p.stablecoin)).toBe(true)
    expect(out.some(p => p.symbol === 'WMNT-USDC')).toBe(false)
  })

  test('noIlRisk drops IL-risk pools', async () => {
    const out = await fetchMantleYields({ noIlRisk: true, fetchImpl: fakeFetch(SAMPLE) })
    expect(out.every(p => p.ilRisk !== 'yes')).toBe(true)
  })

  test('project filter matches a protocol slug substring', async () => {
    const out = await fetchMantleYields({ project: 'aave', fetchImpl: fakeFetch(SAMPLE) })
    expect(out.length).toBe(1)
    expect(out[0]?.project).toBe('aave-v3')
  })

  test('annotates restricted products', async () => {
    const out = await fetchMantleYields({ sortBy: 'tvl', fetchImpl: fakeFetch(SAMPLE) })
    const usdy = out.find(p => p.symbol === 'USDY')
    expect(usdy?.restricted).toBe(true)
    const usdc = out.find(p => p.symbol === 'USDC')
    expect(usdc?.restricted).toBe(false)
  })

  test('throws a clear error on non-200', async () => {
    const errFetch = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch
    await expect(fetchMantleYields({ fetchImpl: errFetch })).rejects.toThrow(
      /DeFiLlama yields API 503/,
    )
  })
})
