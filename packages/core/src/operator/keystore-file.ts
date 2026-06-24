import { readFile } from 'node:fs/promises'
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk'
import { PrivkeyOperatorSigner } from './privkey-base'

/**
 * Operator source backed by a Casper secret-key PEM file (the format
 * `casper-client keygen` writes as `secret_key.pem`). Portable across machines,
 * no network dependency, no OS keychain.
 *
 * Casper PEMs are unencrypted PKCS#8; there is no passphrase. The signer reads
 * the PEM lazily on first use and caches the key in memory. The algorithm is
 * inferred from the PEM's curve OID when possible, defaulting to secp256k1.
 */
export class KeystoreFileOperatorSigner extends PrivkeyOperatorSigner {
  readonly source: string

  constructor(
    private readonly opts: {
      /** Absolute path to the Casper secret-key PEM. */
      path: string
      /** Key algorithm. When omitted, inferred from the PEM (defaults secp256k1). */
      algorithm?: KeyAlgorithm
      /**
       * Accepted for CLI call-site compatibility; ignored (Casper PEMs are
       * unencrypted). Present so existing prompts that collect a passphrase
       * still type-check.
       */
      passphrase?: string
    },
  ) {
    super()
    if (opts.algorithm) this.algorithm = opts.algorithm
    this.source = `keystore:${opts.path}`
  }

  protected async loadPrivateKey(): Promise<PrivateKey> {
    const pem = await readFile(this.opts.path, 'utf8')
    // Ed25519 PEMs carry the Ed25519 OID; secp256k1 PEMs carry the EC OID. Try
    // the configured/secp256k1 algorithm first, fall back to ed25519.
    const tryAlgos: KeyAlgorithm[] = this.opts.algorithm
      ? [this.opts.algorithm]
      : [KeyAlgorithm.SECP256K1, KeyAlgorithm.ED25519]
    let lastErr: unknown
    for (const algo of tryAlgos) {
      try {
        const pk = PrivateKey.fromPem(pem, algo)
        this.algorithm = algo
        return pk
      } catch (e) {
        lastErr = e
      }
    }
    throw new Error(
      `KeystoreFileOperatorSigner: failed to load Casper secret-key PEM at ${this.opts.path}: ${(lastErr as Error)?.message ?? 'unknown'}`,
    )
  }
}
