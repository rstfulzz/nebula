import { describe, expect, test } from 'bun:test'
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk'
import { RawPrivkeyOperatorSigner } from './raw-privkey'

// Fixed 32-byte secp256k1 private key hex. Its Casper public key is deterministic.
const FIXTURE_PK = '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
// Casper secp256k1 public key hex (algorithm tag `02` + SEC1-compressed point).
const FIXTURE_PUB = PrivateKey.fromHex(FIXTURE_PK, KeyAlgorithm.SECP256K1).publicKey.toHex()

describe('RawPrivkeyOperatorSigner', () => {
  test('accepts hex with 0x prefix', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: `0x${FIXTURE_PK}` })
    expect(await signer.publicKeyHex()).toBe(FIXTURE_PUB)
  })

  test('accepts hex without 0x prefix', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: FIXTURE_PK })
    expect(await signer.publicKeyHex()).toBe(FIXTURE_PUB)
  })

  test('public key is a deterministic secp256k1 hex (02 tag)', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: FIXTURE_PK })
    const pub = await signer.publicKeyHex()
    expect(pub.startsWith('02')).toBe(true)
    expect(pub).toBe(FIXTURE_PUB)
  })

  test('rejects non-hex input', () => {
    expect(() => new RawPrivkeyOperatorSigner({ privkey: 'not-a-key' })).toThrow()
  })

  test('rejects short hex', () => {
    expect(() => new RawPrivkeyOperatorSigner({ privkey: '0xabcd' })).toThrow()
  })

  test('rejects too-long hex', () => {
    expect(() => new RawPrivkeyOperatorSigner({ privkey: `0x${FIXTURE_PK}ff` })).toThrow()
  })

  test('source label defaults to raw-privkey', () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: `0x${FIXTURE_PK}` })
    expect(signer.source).toBe('raw-privkey')
  })

  test('source label respects explicit sourceLabel', () => {
    const signer = new RawPrivkeyOperatorSigner({
      privkey: `0x${FIXTURE_PK}`,
      sourceLabel: 'env:NEBULA_OPERATOR_PRIVKEY',
    })
    expect(signer.source).toBe('raw-privkey:env:NEBULA_OPERATOR_PRIVKEY')
  })
})
