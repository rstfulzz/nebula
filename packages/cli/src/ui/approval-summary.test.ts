import { describe, expect, it } from 'bun:test'
import { summarizeApprovalSubject } from './approval-summary'

// A 66-char Casper secp256k1 public key (02-prefixed). shortAddr truncates to
// first 6 + last 4.
const PUBKEY = '0203c635e6eb223ae14143e23ceea9440bc773dc87ec223ae14143e23ceea94400b'
const PUBKEY_SHORT = '0203c6…400b'
const VALIDATOR = '0190e1d7d79f06f956d4d2666b5c93dafab721c84721d4d2666b5c93dafab721c84'
const VALIDATOR_SHORT = '0190e1…1c84'

describe('summarizeApprovalSubject', () => {
  it('renders chain.send native CSPR with amount + recipient', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'chain.send',
        amount: '2.5',
        recipient: PUBKEY,
        token: 'CSPR',
        reason: 'native CSPR transfer',
      }),
    ).toBe(`send 2.5 CSPR to ${PUBKEY_SHORT}`)
  })

  it('renders chain.send CEP-18 with explicit token symbol', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'chain.send',
        amount: '0.5',
        recipient: PUBKEY,
        token: 'USDC',
        reason: 'CEP-18 transfer',
      }),
    ).toBe(`send 0.5 USDC to ${PUBKEY_SHORT}`)
  })

  it('renders chain.send native fallback label (CSPR) when token omitted', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'chain.send',
        amount: '2.5',
        recipient: PUBKEY,
        reason: 'native CSPR transfer',
      }),
    ).toBe(`send 2.5 CSPR to ${PUBKEY_SHORT}`)
  })

  it('renders casper.stake as a send to a validator', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'chain.send',
        amount: '500',
        recipient: VALIDATOR,
        token: 'stake',
        reason: 'native delegation',
      }),
    ).toBe(`send 500 stake to ${VALIDATOR_SHORT}`)
  })

  it('renders casper.unstake as a send to a validator', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'chain.send',
        amount: '500',
        recipient: VALIDATOR,
        token: 'unstake',
        reason: 'native undelegation',
      }),
    ).toBe(`send 500 unstake to ${VALIDATOR_SHORT}`)
  })

  it('renders chain.swap with token-pair encoding (Friendly Market)', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'chain.swap',
        amount: '0.005',
        token: 'CSPR→USDC',
        reason: 'Friendly Market swap execution',
      }),
    ).toBe('swap 0.005 CSPR→USDC')
  })

  it('renders chain.swap with empty amt + tok', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'chain.swap',
        reason: 'Friendly Market swap execution',
      }),
    ).toBe('swap')
  })

  it('renders chain.write with command + recipient + value', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'chain.write',
        recipient: VALIDATOR,
        command: 'transfer(Key, U256)',
        amount: '1 mote',
        reason: 'arbitrary state-changing call',
      }),
    ).toBe(`transfer(Key, U256) (value: 1 mote) on ${VALIDATOR_SHORT}`)
  })

  it('renders chain.write with no recipient without a trailing "on"', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'chain.write',
        command: 'delegate 500 CSPR',
        reason: 'native delegation',
      }),
    ).toBe('delegate 500 CSPR')
  })

  it('renders chain.write with no value', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'chain.write',
        recipient: VALIDATOR,
        command: 'get_balance()',
        reason: 'arbitrary state-changing call',
      }),
    ).toBe(`get_balance() on ${VALIDATOR_SHORT}`)
  })

  it('falls back to command for shell.run', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'shell.run',
        command: 'rm -rf /tmp/foo',
        reason: 'shell command execution',
      }),
    ).toBe('rm -rf /tmp/foo')
  })

  it('falls back to path for fs.write', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'fs.write',
        path: '/tmp/x.txt',
        reason: 'fs.write request',
      }),
    ).toBe('/tmp/x.txt')
  })

  it('falls back to (unspecified) when nothing usable', () => {
    expect(
      summarizeApprovalSubject({
        kind: 'fs.patch',
        reason: 'fs.patch request',
      }),
    ).toBe('(unspecified)')
  })
})
