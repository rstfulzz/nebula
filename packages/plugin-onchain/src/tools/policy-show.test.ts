import { describe, expect, test } from 'bun:test'
import type { Address } from 'viem'
import type { OnchainPolicy } from '../policy'
import type { OnchainRuntimeContext } from '../types'
import { makePolicyShow } from './policy-show'

function ctx(policy?: OnchainPolicy): OnchainRuntimeContext {
  return {
    agentEoa: '0x1e930c1647EaB93651FD94e760E0cbbb5F4FC99f' as Address,
    network: 'mantle-mainnet',
    publicClient: {} as never,
    walletClient: {} as never,
    agentDir: '/tmp',
    mintBlock: 0n,
    policy,
  }
}

describe('policy.show', () => {
  test('reports not-enforced when no policy is configured', async () => {
    const res = await makePolicyShow(ctx(undefined)).handler({})
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect((res.data as { enforced: boolean }).enforced).toBe(false)
  })

  test('formats caps in MNT and flags the approval threshold', async () => {
    const res = await makePolicyShow(
      ctx({
        maxNativeWeiPerTx: 2n * 10n ** 18n,
        autoMaxNativeWeiPerTx: 10n ** 17n,
        maxSlippageBps: 100,
        autonomy: 'auto',
      }),
    ).handler({})
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const d = res.data as {
      enforced: boolean
      maxNativePerTx: string | null
      autoApproveUpToNative: string | null
      approvalAboveAuto: boolean
      maxSlippageBps: number | null
    }
    expect(d.enforced).toBe(true)
    expect(d.maxNativePerTx).toBe('2 MNT')
    expect(d.autoApproveUpToNative).toBe('0.1 MNT')
    expect(d.approvalAboveAuto).toBe(true)
    expect(d.maxSlippageBps).toBe(100)
  })

  test('surfaces read-only mode', async () => {
    const res = await makePolicyShow(ctx({ readOnly: true })).handler({})
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const d = res.data as { readOnly: boolean; summary: string }
    expect(d.readOnly).toBe(true)
    expect(d.summary).toMatch(/READ-ONLY/)
  })

  test('reports allowlist sizes', async () => {
    const res = await makePolicyShow(
      ctx({ recipientAllowlist: ['0xabc'], tokenAllowlist: ['0x1', '0x2'] }),
    ).handler({})
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const d = res.data as { recipientAllowlist: string[] | null; tokenAllowlist: string[] | null }
    expect(d.recipientAllowlist?.length).toBe(1)
    expect(d.tokenAllowlist?.length).toBe(2)
  })
})
