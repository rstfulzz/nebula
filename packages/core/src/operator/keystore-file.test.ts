import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk'
import { KeystoreFileOperatorSigner } from './keystore-file'

describe('KeystoreFileOperatorSigner', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'nebula-keystore-file-'))
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('reads a Casper secret-key PEM and exposes the public key', async () => {
    const pk = PrivateKey.generate(KeyAlgorithm.SECP256K1)
    const path = join(tmp, 'secret_key.pem')
    await writeFile(path, pk.toPem())

    const signer = new KeystoreFileOperatorSigner({ path })
    const pub = await signer.publicKeyHex()
    expect(pub).toBe(pk.publicKey.toHex())
    expect(signer.source).toBe(`keystore:${path}`)
  }, 30_000)

  test('throws on a malformed PEM', async () => {
    const path = join(tmp, 'broken.pem')
    await writeFile(path, 'not a valid pem')

    const signer = new KeystoreFileOperatorSigner({ path })
    await expect(signer.publicKeyHex()).rejects.toThrow()
  }, 30_000)

  test('reports source label as keystore:<path>', () => {
    const signer = new KeystoreFileOperatorSigner({ path: '/tmp/fake.pem' })
    expect(signer.source).toBe('keystore:/tmp/fake.pem')
  })
})
