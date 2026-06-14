import { describe, expect, it } from 'bun:test'
import { type OnchainPolicy, type PolicyAction, evaluatePolicy, policyFromEnv } from './policy'

const ONE_MNT = 10n ** 18n
const send = (over: Partial<PolicyAction> = {}): PolicyAction => ({
  kind: 'transfer',
  asset: 'native',
  amountRaw: ONE_MNT,
  to: '0x1111111111111111111111111111111111111111',
  ...over,
})

describe('evaluatePolicy', () => {
  it('allows a compliant native transfer', () => {
    const v = evaluatePolicy(send(), { maxNativeWeiPerTx: 2n * ONE_MNT })
    expect(v.allowed).toBe(true)
    expect(v.violations).toHaveLength(0)
    expect(v.requiresApproval).toBe(false)
  })

  it('blocks a native transfer over the per-tx cap', () => {
    const v = evaluatePolicy(send({ amountRaw: 5n * ONE_MNT }), { maxNativeWeiPerTx: 2n * ONE_MNT })
    expect(v.allowed).toBe(false)
    expect(v.violations[0]).toContain('exceeds per-tx cap')
  })

  it('blocks a recipient not in the allowlist', () => {
    const v = evaluatePolicy(send({ to: '0x2222222222222222222222222222222222222222' }), {
      recipientAllowlist: ['0x1111111111111111111111111111111111111111'],
    })
    expect(v.allowed).toBe(false)
    expect(v.violations[0]).toContain('not in the recipient allowlist')
  })

  it('allows an allowlisted recipient case-insensitively', () => {
    const v = evaluatePolicy(send({ to: '0xAAAAaaaaAAAAaaaaAAAAaaaaaAAAAAAaAAAAaAAa' }), {
      recipientAllowlist: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    })
    expect(v.allowed).toBe(true)
  })

  it('blocks a token not in the token allowlist', () => {
    const v = evaluatePolicy(
      { kind: 'transfer', asset: '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead', amountRaw: 1n },
      { tokenAllowlist: ['0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9'] },
    )
    expect(v.allowed).toBe(false)
    expect(v.violations[0]).toContain('not in the token allowlist')
  })

  it('blocks a swap whose slippage exceeds the cap', () => {
    const v = evaluatePolicy(
      { kind: 'swap', asset: 'native', amountRaw: ONE_MNT, slippageBps: 300 },
      { maxSlippageBps: 100 },
    )
    expect(v.allowed).toBe(false)
    expect(v.violations[0]).toContain('slippage')
  })

  it('blocks everything under a read-only policy', () => {
    const v = evaluatePolicy(send(), { readOnly: true })
    expect(v.allowed).toBe(false)
  })

  it('requires approval in the confirm tier', () => {
    const v = evaluatePolicy(send(), { autonomy: 'confirm' })
    expect(v.allowed).toBe(true)
    expect(v.requiresApproval).toBe(true)
  })

  it('escalates to approval when a native send exceeds the auto ceiling', () => {
    const policy: OnchainPolicy = { autonomy: 'auto', autoMaxNativeWeiPerTx: ONE_MNT / 10n }
    expect(evaluatePolicy(send({ amountRaw: ONE_MNT / 100n }), policy).requiresApproval).toBe(false)
    expect(evaluatePolicy(send({ amountRaw: ONE_MNT }), policy).requiresApproval).toBe(true)
  })
})

describe('token allowlist — adversarial', () => {
  const A = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa'
  const B = '0xBbBbBBBBbBbbBbBBbbBbbBbBbBbBbBbBbBbBBbBB'
  const policy: OnchainPolicy = { tokenAllowlist: [A] }

  it('blocks a swap whose OUTPUT token is not allowlisted (no acquiring arbitrary tokens)', () => {
    const v = evaluatePolicy({ kind: 'swap', asset: A, toAsset: B, amountRaw: 1n }, policy)
    expect(v.allowed).toBe(false)
    expect(v.violations.some(s => /output token/.test(s))).toBe(true)
  })

  it('allows a swap when both legs are allowlisted (case-insensitive)', () => {
    const v = evaluatePolicy(
      { kind: 'swap', asset: A.toLowerCase(), toAsset: A.toUpperCase(), amountRaw: 1n },
      policy,
    )
    expect(v.allowed).toBe(true)
  })

  it('allows a swap OUTPUT to native even with a token allowlist', () => {
    const v = evaluatePolicy({ kind: 'swap', asset: A, toAsset: 'native', amountRaw: 1n }, policy)
    expect(v.allowed).toBe(true)
  })

  it('still blocks a swap whose INPUT token is not allowlisted', () => {
    const v = evaluatePolicy({ kind: 'swap', asset: B, toAsset: A, amountRaw: 1n }, policy)
    expect(v.allowed).toBe(false)
  })
})

describe('amount-cap boundaries', () => {
  it('allows exactly at the native cap, blocks one wei over', () => {
    const policy: OnchainPolicy = { maxNativeWeiPerTx: ONE_MNT }
    expect(evaluatePolicy(send({ amountRaw: ONE_MNT }), policy).allowed).toBe(true)
    expect(evaluatePolicy(send({ amountRaw: ONE_MNT + 1n }), policy).allowed).toBe(false)
  })

  it('auto tier: no approval exactly at the auto ceiling, approval one wei over', () => {
    const policy: OnchainPolicy = { autoMaxNativeWeiPerTx: ONE_MNT }
    expect(evaluatePolicy(send({ amountRaw: ONE_MNT }), policy).requiresApproval).toBe(false)
    expect(evaluatePolicy(send({ amountRaw: ONE_MNT + 1n }), policy).requiresApproval).toBe(true)
  })
})

describe('policyFromEnv', () => {
  it('returns undefined when no policy env is set', () => {
    expect(policyFromEnv({})).toBeUndefined()
  })

  it('parses caps, slippage, tier and allowlists', () => {
    const p = policyFromEnv({
      NEBULA_POLICY_MAX_NATIVE_MNT: '1.5',
      NEBULA_POLICY_MAX_SLIPPAGE_BPS: '50',
      NEBULA_POLICY_AUTONOMY: 'confirm',
      NEBULA_POLICY_RECIPIENT_ALLOWLIST: '0xabc, 0xdef',
    })
    expect(p?.maxNativeWeiPerTx).toBe(1_500_000_000_000_000_000n)
    expect(p?.maxSlippageBps).toBe(50)
    expect(p?.autonomy).toBe('confirm')
    expect(p?.recipientAllowlist).toEqual(['0xabc', '0xdef'])
  })
})
