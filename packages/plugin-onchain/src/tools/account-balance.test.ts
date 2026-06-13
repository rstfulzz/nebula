import { describe, expect, test } from 'bun:test'
import type { PublicClient, WalletClient } from 'viem'
import type { OnchainRuntimeContext } from '../types'
import { makeAccountBalance } from './account-balance'

// Minimal viem PublicClient shim — only the calls account.balance touches.
function fakeClient(returnWei: bigint): Partial<PublicClient> {
  return {
    getBalance: async () => returnWei,
  } as Partial<PublicClient>
}

function makeCtx(overrides: Partial<OnchainRuntimeContext> = {}): OnchainRuntimeContext {
  return {
    agentEoa: '0x1e930c1647EaB93651FD94e760E0cbbb5F4FC99f',
    network: 'mantle-mainnet',
    publicClient: fakeClient(1_158n * 10n ** 15n) as PublicClient,
    walletClient: {} as WalletClient,
    agentDir: '/tmp/nebula-test-agent',
    mintBlock: 0n,
    ...overrides,
  }
}

describe('account.balance brain tool', () => {
  test('returns EOA mainnet balance even when testnet RPC unreachable', async () => {
    const tool = makeAccountBalance(makeCtx())
    const result = await tool.handler({})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const data = result.data as { eoaMainnet: { formatted: string } }
    expect(data.eoaMainnet.formatted).toBe('1.158000')
  })

  test('reports both mainnet and testnet EOA positions, no 0G envelopes', async () => {
    const tool = makeAccountBalance(makeCtx())
    const result = await tool.handler({})
    if (!result.ok) throw new Error(`unexpected fail: ${result.error}`)
    const data = result.data as Record<string, unknown>
    expect(data.eoaMainnet).toBeDefined()
    expect(data.eoaTestnet).toBeDefined()
    expect(data.positionSummary).toBeDefined()
    // 0G compute-ledger / sandbox-billing envelopes are gone.
    expect(data.computeLedger).toBeUndefined()
    expect(data.sandboxBillingReserve).toBeUndefined()
  })

  test('tool description points the brain at it for "balance" intent', () => {
    const tool = makeAccountBalance(makeCtx())
    expect(tool.description).toMatch(/balance|MNT|EOA/i)
    expect(tool.searchHint).toMatch(/balance|position|funds/)
  })

  test('formatted helper preserves 6 decimals + handles small values', async () => {
    // 0.000001 MNT = 10^12 wei, should render as "0.000001"
    const tool = makeAccountBalance(
      makeCtx({ publicClient: fakeClient(10n ** 12n) as PublicClient }),
    )
    const result = await tool.handler({})
    if (!result.ok) throw new Error(`unexpected fail: ${result.error}`)
    const data = result.data as { eoaMainnet: { formatted: string } }
    expect(data.eoaMainnet.formatted).toBe('0.000001')
  })
})
