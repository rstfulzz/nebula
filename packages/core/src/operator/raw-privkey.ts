import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk'
import { PrivkeyOperatorSigner } from './privkey-base'

/**
 * Operator source backed by a raw private key supplied as a hex string.
 *
 * CLI layer collects the hex (stdin prompt, `--privkey` flag, or
 * `NEBULA_OPERATOR_PRIVKEY` env var) and passes it in. The signer wraps it as a
 * casper-js-sdk `PrivateKey`. Intended for CI/scripting and for users who
 * prefer no on-disk secrets.
 *
 * The hex may be passed with or without the `0x` prefix; the signer normalizes.
 * Defaults to secp256k1 (matching the derived agent wallet); pass `algorithm`
 * for an ed25519 operator key.
 */
export class RawPrivkeyOperatorSigner extends PrivkeyOperatorSigner {
  readonly source: string
  private readonly privkeyHex: string

  constructor(opts: {
    /** Raw private key hex (32 bytes), with or without `0x` prefix. */
    privkey: string
    /** Key algorithm. Default secp256k1. */
    algorithm?: KeyAlgorithm
    /**
     * Optional label for logs (e.g. `"env:NEBULA_OPERATOR_PRIVKEY"` or
     * `"stdin"`). Defaults to `"raw-privkey"`.
     */
    sourceLabel?: string
  }) {
    super()
    const raw = opts.privkey.trim().replace(/^0x/, '')
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
      throw new Error('RawPrivkeyOperatorSigner: privkey must be 32 bytes hex (with or without 0x)')
    }
    this.privkeyHex = raw
    this.algorithm = opts.algorithm ?? KeyAlgorithm.SECP256K1
    this.source = opts.sourceLabel ? `raw-privkey:${opts.sourceLabel}` : 'raw-privkey'
  }

  protected async loadPrivateKey(): Promise<PrivateKey> {
    return PrivateKey.fromHex(this.privkeyHex, this.algorithm)
  }
}
