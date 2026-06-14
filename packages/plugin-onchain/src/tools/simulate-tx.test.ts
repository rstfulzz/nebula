import { describe, expect, test } from 'bun:test'
import type { Address, PublicClient } from 'viem'
import type { OnchainRuntimeContext } from '../types'
import { makeTxSimulate } from './simulate-tx'

const AGENT = '0x1e930c1647EaB93651FD94e760E0cbbb5F4FC99f' as Address
const TARGET = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9' as Address

function ctx(estimateGas: (a: unknown) => Promise<bigint>): OnchainRuntimeContext {
  return {
    agentEoa: AGENT,
    network: 'mantle-mainnet',
    publicClient: { estimateGas } as unknown as PublicClient,
    walletClient: {} as never,
    agentDir: '/tmp',
    mintBlock: 0n,
  }
}

describe('tx.simulate', () => {
  test('signature path: reports wouldSucceed + gas, never broadcasts', async () => {
    const tool = makeTxSimulate(ctx(async () => 52000n))
    const res = await tool.handler({
      to: TARGET,
      signature: 'transfer(address,uint256)',
      args: [AGENT, '1000000'],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const d = res.data as { wouldSucceed: boolean; gasEstimate: string; from: string }
    expect(d.wouldSucceed).toBe(true)
    expect(d.gasEstimate).toBe('52000')
    expect(d.from).toBe(AGENT)
  })

  test('revert path: surfaces wouldSucceed=false (no throw)', async () => {
    const tool = makeTxSimulate(
      ctx(async () => {
        throw new Error('execution reverted: ERC20: transfer amount exceeds balance')
      }),
    )
    const res = await tool.handler({
      to: TARGET,
      signature: 'transfer(address,uint256)',
      args: [AGENT, '999999999999999999999'],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const d = res.data as { wouldSucceed: boolean; revertReason?: string }
    expect(d.wouldSucceed).toBe(false)
    expect(d.revertReason).toBeDefined()
  })

  test('raw data path works without a signature', async () => {
    const tool = makeTxSimulate(ctx(async () => 21000n))
    const res = await tool.handler({ to: TARGET, data: '0xdeadbeef' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect((res.data as { wouldSucceed: boolean }).wouldSucceed).toBe(true)
  })

  test('requires signature or data', async () => {
    const tool = makeTxSimulate(ctx(async () => 21000n))
    const res = await tool.handler({ to: TARGET })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toMatch(/signature.*or raw .data/)
  })

  test('rejects an invalid target address', async () => {
    const tool = makeTxSimulate(ctx(async () => 21000n))
    const res = await tool.handler({ to: 'not-an-address-but-long-enough-to-pass-min', data: '0x' })
    expect(res.ok).toBe(false)
  })

  test('simulates as a custom `from` when provided', async () => {
    let seenFrom: string | undefined
    const tool = makeTxSimulate(
      ctx(async (a: unknown) => {
        seenFrom = (a as { account: string }).account
        return 30000n
      }),
    )
    const other = '0x3B4f0135465d444a5bD06Ab90fC59B73916C85F5'
    await tool.handler({ to: TARGET, data: '0x06fdde03', from: other })
    expect(seenFrom?.toLowerCase()).toBe(other.toLowerCase())
  })
})
