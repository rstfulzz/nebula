import { describe, expect, it } from 'bun:test'
import { csprToMotes } from './config'
import { type OnchainPolicy, evaluatePolicy, policyFromEnv } from './policy'

describe('evaluatePolicy', () => {
  const base: OnchainPolicy = {
    autonomy: 'auto',
    maxNativeMotesPerTx: csprToMotes(100),
    autoMaxNativeMotesPerTx: csprToMotes(5),
  }

  it('allows a small native transfer within caps, no approval', () => {
    const v = evaluatePolicy(
      { kind: 'transfer', asset: 'native', amountMotes: csprToMotes(2.5), to: '01ab' },
      base,
    )
    expect(v.allowed).toBe(true)
    expect(v.requiresApproval).toBe(false)
    expect(v.violations).toHaveLength(0)
  })

  it('blocks a transfer over the per-tx cap', () => {
    const v = evaluatePolicy(
      { kind: 'transfer', asset: 'native', amountMotes: csprToMotes(200), to: '01ab' },
      base,
    )
    expect(v.allowed).toBe(false)
    expect(v.violations[0]).toContain('exceeds per-tx cap')
  })

  it('requires approval above the auto ceiling but under the cap', () => {
    const v = evaluatePolicy(
      { kind: 'transfer', asset: 'native', amountMotes: csprToMotes(10), to: '01ab' },
      base,
    )
    expect(v.allowed).toBe(true)
    expect(v.requiresApproval).toBe(true)
  })

  it('readonly autonomy blocks all writes', () => {
    const v = evaluatePolicy(
      { kind: 'transfer', asset: 'native', amountMotes: 1n },
      { autonomy: 'readonly' },
    )
    expect(v.allowed).toBe(false)
    expect(v.violations[0]).toContain('read-only')
  })

  it('readOnly flag blocks all writes', () => {
    const v = evaluatePolicy(
      { kind: 'stake', asset: 'native', amountMotes: 1n },
      { readOnly: true },
    )
    expect(v.allowed).toBe(false)
  })

  it('confirm autonomy always requires approval', () => {
    const v = evaluatePolicy(
      { kind: 'transfer', asset: 'native', amountMotes: 1n },
      { autonomy: 'confirm' },
    )
    expect(v.allowed).toBe(true)
    expect(v.requiresApproval).toBe(true)
  })

  it('enforces the recipient allowlist (case-insensitive)', () => {
    const p: OnchainPolicy = { recipientAllowlist: ['01AA'] }
    expect(
      evaluatePolicy({ kind: 'transfer', asset: 'native', amountMotes: 1n, to: '01aa' }, p).allowed,
    ).toBe(true)
    expect(
      evaluatePolicy({ kind: 'transfer', asset: 'native', amountMotes: 1n, to: '01bb' }, p).allowed,
    ).toBe(false)
  })

  it('enforces the token allowlist for non-native assets', () => {
    const p: OnchainPolicy = { tokenAllowlist: ['abc'] }
    expect(evaluatePolicy({ kind: 'transfer', asset: 'ABC', amountMotes: 1n }, p).allowed).toBe(
      true,
    )
    expect(evaluatePolicy({ kind: 'transfer', asset: 'xyz', amountMotes: 1n }, p).allowed).toBe(
      false,
    )
  })

  it('an empty policy permits everything', () => {
    const v = evaluatePolicy(
      { kind: 'transfer', asset: 'native', amountMotes: csprToMotes(1_000_000), to: '01ab' },
      {},
    )
    expect(v.allowed).toBe(true)
    expect(v.requiresApproval).toBe(false)
  })
})

describe('policyFromEnv', () => {
  it('returns undefined when no policy env is set', () => {
    expect(policyFromEnv({})).toBeUndefined()
  })

  it('parses caps and autonomy', () => {
    const p = policyFromEnv({
      NEBULA_POLICY_MAX_NATIVE_CSPR: '100',
      NEBULA_POLICY_AUTO_MAX_NATIVE_CSPR: '5',
      NEBULA_POLICY_AUTONOMY: 'auto',
    })!
    expect(p.maxNativeMotesPerTx).toBe(csprToMotes(100))
    expect(p.autoMaxNativeMotesPerTx).toBe(csprToMotes(5))
    expect(p.autonomy).toBe('auto')
  })

  it('parses readonly + recipient allowlist (trimmed)', () => {
    const p = policyFromEnv({
      NEBULA_POLICY_READONLY: '1',
      NEBULA_POLICY_RECIPIENT_ALLOWLIST: '01a, 01b ,01c',
    })!
    expect(p.readOnly).toBe(true)
    expect(p.recipientAllowlist).toEqual(['01a', '01b', '01c'])
  })

  it('ignores invalid numeric caps', () => {
    expect(policyFromEnv({ NEBULA_POLICY_MAX_NATIVE_CSPR: 'abc' })).toBeUndefined()
  })
})
