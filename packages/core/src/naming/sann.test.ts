import { describe, expect, test } from 'bun:test'
import type { PublicClient } from 'viem'
import { SANN_ADDRESSES, resolveSubnameAddress, sannNamehash, subnameNode } from './sann'

const SPECTER_EOA = '0x1e930c1647EaB93651FD94e760E0cbbb5F4FC99f'

function fakeClient(textReturn: string): Partial<PublicClient> {
  return {
    readContract: async () => textReturn,
  } as Partial<PublicClient>
}

describe('sann namehash', () => {
  test('baseNode for 0g matches on-chain readout', () => {
    const base = sannNamehash(SANN_ADDRESSES.tldIdentifier, '0g', [])
    expect(base).toBe('0x3e6ae2a6b7e1fb0e2af0c69c8d7d4e285626695305c4cf0e1399e5f24b53c38c')
  })

  test('nebula.0g namehash is deterministic from the on-chain-verified baseNode', () => {
    // baseNode (above) is verified against the on-chain TLD root; this is one
    // label deeper, so it is a pure keccak of (baseNode, label='nebula').
    const node = sannNamehash(SANN_ADDRESSES.tldIdentifier, '0g', ['nebula'])
    expect(node).toBe('0x8d36cab9d062064b973148f2123570e577244eb99c23e27b3433e48a3f0b7df6')
  })

  test('subnameNode for alice.nebula.0g is deterministic', () => {
    const a = subnameNode('alice')
    const b = subnameNode('alice')
    expect(a).toBe(b)
  })

  test('different labels produce different subname nodes', () => {
    expect(subnameNode('alice')).not.toBe(subnameNode('bob'))
  })
})

describe('resolveSubnameAddress', () => {
  test('empty label short-circuits to null', async () => {
    const r = await resolveSubnameAddress(fakeClient('') as PublicClient, '')
    expect(r).toBeNull()
  })

  test('empty resolver text record returns null', async () => {
    const r = await resolveSubnameAddress(fakeClient('') as PublicClient, 'alice')
    expect(r).toBeNull()
  })

  test('valid checksummed address returned as Address', async () => {
    const r = await resolveSubnameAddress(fakeClient(SPECTER_EOA) as PublicClient, 'alice')
    expect(r).toBe(SPECTER_EOA)
  })

  test('lowercase address is checksum-corrected by getAddress', async () => {
    const r = await resolveSubnameAddress(
      fakeClient(SPECTER_EOA.toLowerCase()) as PublicClient,
      'alice',
    )
    expect(r).toBe(SPECTER_EOA)
  })

  test('malformed hex returns null (getAddress throws, caught)', async () => {
    const r = await resolveSubnameAddress(fakeClient('0xZZZZ') as PublicClient, 'alice')
    expect(r).toBeNull()
  })

  test('non-hex garbage returns null (getAddress throws, caught)', async () => {
    const r = await resolveSubnameAddress(fakeClient('not-an-address') as PublicClient, 'alice')
    expect(r).toBeNull()
  })

  test('truncated 0x-prefixed string returns null', async () => {
    const r = await resolveSubnameAddress(fakeClient('0xdeadbeef') as PublicClient, 'alice')
    expect(r).toBeNull()
  })
})
