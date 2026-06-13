import { describe, expect, test } from 'bun:test'
import type { PublicClient } from 'viem'
import { resolveRecipient } from './transfer'

// resolveRecipient is 0x-only on Mantle (no on-chain name service); the client
// arg is unused, so a bare shim is fine.
const noClient = {} as PublicClient
const SAMPLE_EOA = '0x1e930c1647EaB93651FD94e760E0cbbb5F4FC99f'

describe('resolveRecipient', () => {
  test('checksummed 0x address passes through unchanged', async () => {
    expect(await resolveRecipient(SAMPLE_EOA, noClient)).toBe(SAMPLE_EOA)
  })

  test('lowercase 0x address is checksum-corrected', async () => {
    const lower = SAMPLE_EOA.toLowerCase() as `0x${string}`
    expect(await resolveRecipient(lower, noClient)).toBe(SAMPLE_EOA)
  })

  test('0x address with whitespace is trimmed', async () => {
    expect(await resolveRecipient(`  ${SAMPLE_EOA}  `, noClient)).toBe(SAMPLE_EOA)
  })

  test('non-address input throws with a helpful message', async () => {
    await expect(resolveRecipient('alice', noClient)).rejects.toThrow(/expected a 0x address/)
  })

  test('name-service-style input is rejected (0x-only on Mantle)', async () => {
    await expect(resolveRecipient('alice.nebula.0g', noClient)).rejects.toThrow(
      /expected a 0x address/,
    )
  })
})
