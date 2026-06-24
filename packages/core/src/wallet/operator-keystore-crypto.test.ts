import { describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk'
import { KeystoreFileOperatorSigner } from '../operator/keystore-file'
import { RawPrivkeyOperatorSigner } from '../operator/raw-privkey'
import {
  OPERATOR_BLOB_SCOPES,
  OPERATOR_KEYSTORE_VERSION,
  decodeKeystoreBytes,
  decodeOperatorBlobBytes,
  decryptAgentKey,
  decryptOperatorBlob,
  deriveBlobKey,
  deriveKeystoreKey,
  encodeKeystoreBytes,
  encodeOperatorBlobBytes,
  encryptAgentKey,
  encryptOperatorBlob,
  sniffKeystoreVersion,
  tryDecryptKeystoreWithKey,
  tryDecryptOperatorBlobWithKey,
} from './operator-keystore-crypto'

/** A random 32-byte secret key hex (operator or agent private key material). */
function randomPrivkey(): string {
  return randomBytes(32).toString('hex')
}

/**
 * A stable agent "address" string used purely for domain separation in the
 * keystore-unlock message. We derive a real Casper secp256k1 public key hex so
 * two distinct privkeys yield two distinct addresses.
 */
function randomAgentAddress(): string {
  return PrivateKey.fromHex(randomPrivkey(), KeyAlgorithm.SECP256K1).publicKey.toHex()
}

describe('operator-keystore-crypto', () => {
  test('encrypt + decrypt round-trip via RawPrivkeyOperatorSigner', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agentPrivkey = randomPrivkey()
    const agentAddress = randomAgentAddress()

    const keystore = await encryptAgentKey({ signer, agentAddress, agentPrivkey })
    expect(keystore.version).toBe(OPERATOR_KEYSTORE_VERSION)
    expect(keystore.blob.length).toBeGreaterThan(0)

    const decrypted = await decryptAgentKey({ signer, agentAddress, keystore })
    expect(decrypted).toBe(agentPrivkey)
  })

  test('encrypt + decrypt round-trip via KeystoreFileOperatorSigner', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'nebula-op-ks-'))
    try {
      const operatorKey = PrivateKey.generate(KeyAlgorithm.SECP256K1)
      const path = join(tmp, 'secret_key.pem')
      await writeFile(path, operatorKey.toPem())

      const signer = new KeystoreFileOperatorSigner({ path })
      const agentPrivkey = randomPrivkey()
      const agentAddress = randomAgentAddress()

      const keystore = await encryptAgentKey({ signer, agentAddress, agentPrivkey })
      const decrypted = await decryptAgentKey({ signer, agentAddress, keystore })
      expect(decrypted).toBe(agentPrivkey)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  }, 30_000)

  test('different operator privkeys derive different keys (cross-decrypt fails)', async () => {
    const operatorA = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const operatorB = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agentPrivkey = randomPrivkey()
    const agentAddress = randomAgentAddress()

    const keystore = await encryptAgentKey({ signer: operatorA, agentAddress, agentPrivkey })
    await expect(decryptAgentKey({ signer: operatorB, agentAddress, keystore })).rejects.toThrow()
  })

  test('different agent addresses derive different keys (so blobs are domain-separated)', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agentA = randomAgentAddress()
    const agentB = randomAgentAddress()
    const agentPrivkey = randomPrivkey()

    const keystore = await encryptAgentKey({ signer, agentAddress: agentA, agentPrivkey })
    await expect(decryptAgentKey({ signer, agentAddress: agentB, keystore })).rejects.toThrow()
  })

  test('two keystores from same operator+agent produce different ciphertexts (random IV)', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agentPrivkey = randomPrivkey()
    const agentAddress = randomAgentAddress()

    const ks1 = await encryptAgentKey({ signer, agentAddress, agentPrivkey })
    const ks2 = await encryptAgentKey({ signer, agentAddress, agentPrivkey })
    expect(ks1.blob).not.toBe(ks2.blob)
    expect(await decryptAgentKey({ signer, agentAddress, keystore: ks1 })).toBe(agentPrivkey)
    expect(await decryptAgentKey({ signer, agentAddress, keystore: ks2 })).toBe(agentPrivkey)
  })

  test('encodeKeystoreBytes + decodeKeystoreBytes round-trip', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agentPrivkey = randomPrivkey()
    const agentAddress = randomAgentAddress()

    const keystore = await encryptAgentKey({ signer, agentAddress, agentPrivkey })
    const bytes = encodeKeystoreBytes(keystore)
    const decoded = decodeKeystoreBytes(bytes)
    expect(decoded.version).toBe(keystore.version)
    expect(decoded.blob).toBe(keystore.blob)
    expect(await decryptAgentKey({ signer, agentAddress, keystore: decoded })).toBe(agentPrivkey)
  })

  test('decode rejects v1 (passphrase) blobs cleanly', () => {
    const v1Blob = new TextEncoder().encode(JSON.stringify({ version: 1, blob: 'x' }))
    expect(() => decodeKeystoreBytes(v1Blob)).toThrow(/version 1/)
  })

  test('sniffKeystoreVersion returns version field for both v1 and v2 shapes', () => {
    const v1Bytes = new TextEncoder().encode(JSON.stringify({ version: 1, blob: 'aaaa' }))
    const v2Bytes = new TextEncoder().encode(JSON.stringify({ version: 2, blob: 'bbbb' }))
    const garbage = new TextEncoder().encode('not-json')
    expect(sniffKeystoreVersion(v1Bytes)).toBe(1)
    expect(sniffKeystoreVersion(v2Bytes)).toBe(2)
    expect(sniffKeystoreVersion(garbage)).toBeNull()
  })

  test('signer determinism: same operator + agent produces same derived key (decrypt across calls works)', async () => {
    const operatorPrivkey = randomPrivkey()
    const signerA = new RawPrivkeyOperatorSigner({ privkey: operatorPrivkey })
    const signerB = new RawPrivkeyOperatorSigner({ privkey: operatorPrivkey })
    const agentPrivkey = randomPrivkey()
    const agentAddress = randomAgentAddress()

    const keystore = await encryptAgentKey({ signer: signerA, agentAddress, agentPrivkey })
    const decrypted = await decryptAgentKey({ signer: signerB, agentAddress, keystore })
    expect(decrypted).toBe(agentPrivkey)
  })

  // -- encryptOperatorBlob / decryptOperatorBlob (generalized helpers)

  test('operator blob: encrypt + decrypt round-trip with telegram scope', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agent = randomAgentAddress()
    const plaintext = new TextEncoder().encode(
      JSON.stringify({ telegram: { botToken: 'abc:xyz', allowedUserIds: [123] } }),
    )
    const blob = await encryptOperatorBlob({
      signer,
      scope: OPERATOR_BLOB_SCOPES.TELEGRAM,
      agentAddress: agent,
      plaintext,
    })
    expect(blob.version).toBe(OPERATOR_KEYSTORE_VERSION)
    expect(blob.scope).toBe(OPERATOR_BLOB_SCOPES.TELEGRAM)
    const decrypted = await decryptOperatorBlob({
      signer,
      scope: OPERATOR_BLOB_SCOPES.TELEGRAM,
      agentAddress: agent,
      blob,
    })
    expect(new TextDecoder().decode(decrypted)).toBe(new TextDecoder().decode(plaintext))
  })

  test('operator blob: scope mismatch refuses decrypt', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agent = randomAgentAddress()
    const blob = await encryptOperatorBlob({
      signer,
      scope: OPERATOR_BLOB_SCOPES.TELEGRAM,
      agentAddress: agent,
      plaintext: new TextEncoder().encode('payload'),
    })
    await expect(
      decryptOperatorBlob({
        signer,
        scope: OPERATOR_BLOB_SCOPES.KEYSTORE, // intentionally wrong
        agentAddress: agent,
        blob,
      }),
    ).rejects.toThrow(/scope mismatch/)
  })

  test('operator blob: cross-scope keys are different (sig replay across scopes is impossible)', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agent = randomAgentAddress()
    const tgBlob = await encryptOperatorBlob({
      signer,
      scope: OPERATOR_BLOB_SCOPES.TELEGRAM,
      agentAddress: agent,
      plaintext: new TextEncoder().encode('tg-payload'),
    })
    // Force a "fake" keystore-scoped blob by hand-mutating tgBlob.scope and
    // re-trying decrypt under KEYSTORE scope. Should fail with auth/scope
    // error, never silently leak.
    const tampered = { ...tgBlob, scope: OPERATOR_BLOB_SCOPES.KEYSTORE }
    await expect(
      decryptOperatorBlob({
        signer,
        scope: OPERATOR_BLOB_SCOPES.KEYSTORE,
        agentAddress: agent,
        blob: tampered,
      }),
    ).rejects.toThrow()
  })

  test('operator blob: encode/decode bytes round-trip', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agent = randomAgentAddress()
    const blob = await encryptOperatorBlob({
      signer,
      scope: OPERATOR_BLOB_SCOPES.TELEGRAM,
      agentAddress: agent,
      plaintext: new TextEncoder().encode('hello'),
    })
    const bytes = encodeOperatorBlobBytes(blob)
    const decoded = decodeOperatorBlobBytes(bytes)
    expect(decoded.version).toBe(blob.version)
    expect(decoded.scope).toBe(blob.scope)
    expect(decoded.blob).toBe(blob.blob)
  })

  // -- verify helpers -----------------------------------------------------

  test('tryDecryptKeystoreWithKey: true with matching key, false with wrong key', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agentPrivkey = randomPrivkey()
    const agentAddress = randomAgentAddress()
    const keystore = await encryptAgentKey({ signer, agentAddress, agentPrivkey })
    const rightKey = await deriveKeystoreKey(signer, agentAddress)
    const wrongKey = Buffer.alloc(32, 0xab)
    expect(tryDecryptKeystoreWithKey(keystore, rightKey)).toBe(true)
    expect(tryDecryptKeystoreWithKey(keystore, wrongKey)).toBe(false)
  })

  test('tryDecryptKeystoreWithKey: rejects key with wrong length without throwing', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agentPrivkey = randomPrivkey()
    const agentAddress = randomAgentAddress()
    const keystore = await encryptAgentKey({ signer, agentAddress, agentPrivkey })
    expect(tryDecryptKeystoreWithKey(keystore, Buffer.alloc(16, 0))).toBe(false)
    expect(tryDecryptKeystoreWithKey(keystore, Buffer.alloc(64, 0))).toBe(false)
  })

  test('tryDecryptOperatorBlobWithKey: scope mismatch returns false even with correct key', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agent = randomAgentAddress()
    const blob = await encryptOperatorBlob({
      signer,
      scope: OPERATOR_BLOB_SCOPES.PROFILE,
      agentAddress: agent,
      plaintext: new TextEncoder().encode('hi'),
    })
    const profileKey = await deriveBlobKey(signer, agent, OPERATOR_BLOB_SCOPES.PROFILE)
    expect(tryDecryptOperatorBlobWithKey(blob, profileKey, OPERATOR_BLOB_SCOPES.PROFILE)).toBe(true)
    // Wrong scope label refuses even though the AES key is otherwise correct.
    expect(tryDecryptOperatorBlobWithKey(blob, profileKey, OPERATOR_BLOB_SCOPES.TELEGRAM)).toBe(
      false,
    )
  })
})
