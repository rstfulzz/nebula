import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Address } from 'viem'
import type { OnchainRuntimeContext } from '../types'
import { makeAccountInfo } from './account'

// account.info prices holdings best-effort via the free pricing (global fetch).
// Stub fetch so the unit test stays hermetic — empty prices => usdValue null.
const realFetch = globalThis.fetch
beforeAll(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ coins: {} }), { status: 200 })) as unknown as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

function buildClient(blockNumber: bigint) {
  // Multicall returns >=1 entry (native balance is always [0]). Encode 0n as
  // padded uint256 hex so decodeFunctionResult on getEthBalance succeeds.
  const zeroBalance = `0x${'0'.repeat(64)}` as const
  return {
    getBlockNumber: async () => blockNumber,
    getLogs: async () => [],
    readContract: async () => [{ success: true, returnData: zeroBalance }],
  } as unknown as import('viem').PublicClient
}

function buildCtx(overrides: Partial<OnchainRuntimeContext> = {}): OnchainRuntimeContext {
  const dir = mkdtempSync(join(tmpdir(), 'nebula-account-info-test-'))
  return {
    agentEoa: '0xd56bF6116815B18eEA696A8EBCDb7Bab427e9683' as Address,
    network: 'mantle-mainnet',
    publicClient: buildClient(32_300_000n),
    walletClient: {} as import('viem').WalletClient,
    agentDir: dir,
    mintBlock: 0n,
    iNFT: {
      contract: '0x9e71d79f06f956d4d2666b5c93dafab721c84721' as Address,
      tokenId: 6n,
    },
    brainProvider: '0x992e6396157Dc4f22E74F2231235D7DE62696db5',
    brainModel: 'gpt-4o-mini',
    ...overrides,
  }
}

describe('account.info return shape', () => {
  test('bundles wallet + iNFT + brain + network (Mantle-native, no 0G fields)', async () => {
    const ctx = buildCtx()
    const tool = makeAccountInfo(ctx)
    const res = await tool.handler({})
    if (!res.ok) console.error('account.info returned error:', res.error)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const data = res.data as {
      agentEoa: Address
      iNFT: { contract: Address; tokenId: string } | null
      network: string
      brain: { provider: string | null; model: string | null }
      wallet: { native: { formatted: string }; blockNumber: number }
      recentActivity: unknown[]
    }
    expect(data.agentEoa).toBe('0xd56bF6116815B18eEA696A8EBCDb7Bab427e9683')
    expect(data.network).toBe('mantle-mainnet')
    expect(data.iNFT?.tokenId).toBe('6')
    expect(data.brain.model).toBe('gpt-4o-mini')
    expect(Array.isArray(data.recentActivity)).toBe(true)
    // No 0G identity surface anymore.
    expect((data as Record<string, unknown>).subname).toBeUndefined()
    expect((data as Record<string, unknown>).singletons).toBeUndefined()
  })

  test('iNFT is null in local-identity mode', async () => {
    const ctx = buildCtx({ iNFT: undefined })
    const tool = makeAccountInfo(ctx)
    const res = await tool.handler({})
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect((res.data as { iNFT: unknown }).iNFT).toBeNull()
  })
})
