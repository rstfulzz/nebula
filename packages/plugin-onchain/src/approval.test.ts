import { describe, expect, test } from 'bun:test'
import { policyRequiresApprovalForCall } from './approval'
import type { OnchainPolicy } from './policy'

const TOK = '0x1234567890abcdef1234567890abcdef12345678'

describe('policyRequiresApprovalForCall', () => {
  test('no policy → never forces approval', () => {
    expect(policyRequiresApprovalForCall('chain.send', { amount: '999' }, undefined)).toBe(false)
  })

  test('native send above the auto ceiling forces approval', () => {
    const policy: OnchainPolicy = { autoMaxNativeWeiPerTx: 10n ** 17n } // 0.1 MNT
    // 0.5 MNT > 0.1 MNT auto-ceiling → material risk
    expect(
      policyRequiresApprovalForCall('chain.send', { amount: '0.5', token: 'MNT' }, policy),
    ).toBe(true)
  })

  test('native send at/under the auto ceiling does not force approval', () => {
    const policy: OnchainPolicy = { autoMaxNativeWeiPerTx: 10n ** 18n } // 1 MNT
    expect(
      policyRequiresApprovalForCall('chain.send', { amount: '0.5', token: 'MNT' }, policy),
    ).toBe(false)
  })

  test("'confirm' autonomy forces approval for any value-moving call", () => {
    const policy: OnchainPolicy = { autonomy: 'confirm' }
    expect(
      policyRequiresApprovalForCall('chain.send', { amount: '0.001', token: 'MNT' }, policy),
    ).toBe(true)
    expect(
      policyRequiresApprovalForCall('chain.send', { amount: '5', token: TOK, to: TOK }, policy),
    ).toBe(true)
    expect(
      policyRequiresApprovalForCall(
        'swap.execute',
        { amountIn: '1', tokenIn: TOK, tokenOut: TOK },
        policy,
      ),
    ).toBe(true)
  })

  test('token send does not escalate on amount (caps enforced by the tool with decimals)', () => {
    // Only native amount escalates at this layer; a token send under 'auto' tier
    // is not forced (the tool still enforces per-token hard caps).
    const policy: OnchainPolicy = { autoMaxNativeWeiPerTx: 1n }
    expect(
      policyRequiresApprovalForCall('chain.send', { amount: '999', token: TOK, to: TOK }, policy),
    ).toBe(false)
  })

  test('wrap escalates on native amount above the auto ceiling', () => {
    const policy: OnchainPolicy = { autoMaxNativeWeiPerTx: 10n ** 17n }
    expect(policyRequiresApprovalForCall('chain.wrap', { amount: '0.5' }, policy)).toBe(true)
    expect(policyRequiresApprovalForCall('chain.unwrap', { amount: '0.01' }, policy)).toBe(false)
  })

  test('chain.write escalates on wei value above the auto ceiling', () => {
    const policy: OnchainPolicy = { autoMaxNativeWeiPerTx: 1000n }
    expect(policyRequiresApprovalForCall('chain.write', { value: '5000' }, policy)).toBe(true)
    expect(policyRequiresApprovalForCall('chain.write', { value: '500' }, policy)).toBe(false)
  })

  test('unknown / read-only tool names never force approval', () => {
    const policy: OnchainPolicy = { autonomy: 'confirm' }
    expect(policyRequiresApprovalForCall('chain.balance', {}, policy)).toBe(false)
    expect(policyRequiresApprovalForCall('account.info', {}, policy)).toBe(false)
  })
})
