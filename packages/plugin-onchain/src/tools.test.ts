import { describe, it, expect } from 'bun:test'
import { makeSend, makeStake } from './tools'
import { CASPER_NETWORKS, csprToMotes } from './config'
import type { CasperOnchainContext } from './context'

// A network-free context: tools that hit the policy/guard branches return before
// ever touching the RPC or signer, so these assertions are deterministic.
function ctxWith(policy?: CasperOnchainContext['policy']): CasperOnchainContext {
  return {
    rpc: {} as never,
    signer: undefined,
    pub: undefined,
    network: CASPER_NETWORKS['casper-testnet'],
    policy,
    agentDir: '/tmp',
  }
}

const policy = {
  autonomy: 'auto' as const,
  maxNativeMotesPerTx: csprToMotes(100),
  autoMaxNativeMotesPerTx: csprToMotes(5),
}

describe('casper.send policy gating (no network)', () => {
  it('blocks a transfer over the cap', async () => {
    const r = await makeSend(ctxWith(policy)).handler({ to: '01ab', amount: 200 } as never)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('policy blocked')
  })

  it('requires approval over the auto ceiling', async () => {
    const r = await makeSend(ctxWith(policy)).handler({ to: '01ab', amount: 10 } as never)
    expect(r.ok).toBe(false)
    expect((r as { requiresApproval?: boolean }).requiresApproval).toBe(true)
  })

  it('passes policy then stops at the missing signer', async () => {
    const r = await makeSend(ctxWith(policy)).handler({ to: '01ab', amount: 2.5 } as never)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('no signer')
  })
})

describe('casper.stake guards (no network)', () => {
  it('rejects below the 500 CSPR minimum delegation', async () => {
    const r = await makeStake(ctxWith()).handler({ validator: '01v', amount: 100 } as never)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('minimum delegation')
  })

  it('blocks under a read-only policy', async () => {
    const r = await makeStake(ctxWith({ autonomy: 'readonly' })).handler({ validator: '01v', amount: 600 } as never)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('policy blocked')
  })

  it('passes guards then stops at the missing signer', async () => {
    const r = await makeStake(ctxWith()).handler({ validator: '01v', amount: 600 } as never)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('no signer')
  })
})
