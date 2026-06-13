import { describe, expect, test } from 'bun:test'
import { AGNI_BY_NETWORK, FEE_TIERS, MULTICALL3, requireMainnet } from './constants'

describe('mainnet addresses', () => {
  test('Agni Finance addresses (official agni-sdk, on-chain verified)', () => {
    const agni = AGNI_BY_NETWORK['mantle-mainnet']!
    expect(agni.factory).toBe('0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035')
    expect(agni.swapRouter).toBe('0x319B69888b0d11cEC22caA5034e25FfFBDc88421')
    expect(agni.quoter).toBe('0x9488C05a7b75a6FefdcAE4f11a33467bcBA60177')
    expect(agni.weth9).toBe('0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8')
  })

  test('Multicall3 universal address', () => {
    expect(MULTICALL3).toBe('0xcA11bde05977b3631167028862bE2a173976CA11')
  })

  test('Agni not deployed on testnet', () => {
    expect(AGNI_BY_NETWORK['mantle-testnet']).toBeNull()
  })

  test('FEE_TIERS in increasing order', () => {
    expect(FEE_TIERS).toEqual([500, 3000, 10000])
  })

  test('requireMainnet throws on testnet', () => {
    expect(() => requireMainnet('mantle-testnet' as never)).toThrow(/mainnet/)
  })

  test('requireMainnet allows mainnet', () => {
    expect(() => requireMainnet('mantle-mainnet')).not.toThrow()
  })
})
