import { describe, expect, test } from 'bun:test'
import { deriveAgentAccountFromSignature, deriveAgentKeyFromSignature } from './derive'

const SIG = `0x${'ab'.repeat(65)}`

describe('agent wallet derivation', () => {
  test('is deterministic', async () => {
    expect(await deriveAgentKeyFromSignature(SIG)).toBe(await deriveAgentKeyFromSignature(SIG))
  })

  test('produces a valid Casper secp256k1 public key', async () => {
    const a = await deriveAgentAccountFromSignature(SIG)
    expect(a.publicKeyHex).toMatch(/^02[0-9a-fA-F]{66}$/)
    expect(a.address).toBe(a.publicKeyHex)
  })

  test('matches the web derivation (blake2b of the signature)', async () => {
    // The web derives blake2b-256(signature) → Casper secp256k1 PrivateKey.
    // This must be the same key, so the CLI and browser resolve to one agent
    // wallet.
    const a = await deriveAgentAccountFromSignature(SIG)
    expect(a.publicKeyHex).toBe(
      '0202c0f2fe6702d79e0a7364ce25eb8fef2bc0a653211ecf90b9e3c8cc0c4cf59a3a',
    )
  })
})
