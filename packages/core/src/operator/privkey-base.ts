import { KeyAlgorithm, type PrivateKey } from 'casper-js-sdk'
import type { OperatorAccount, OperatorSigner } from './signer'

/**
 * Canonical keystore-unlock message. Embeds the agent public key + scope so a
 * signature for one (agent, scope) can't unlock another. Stable across the CLI
 * and harness; changing it changes every derived key.
 */
export function keystoreUnlockMessage(agent: string, scope: string): string {
  return `nebula keystore unlock\nagent: ${agent}\npurpose: ${scope}`
}

function toBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

/**
 * Shared base for private-key-backed operator sources. Subclasses implement
 * `loadPrivateKey()` (yielding a casper-js-sdk `PrivateKey`); everything else —
 * the public key, deterministic message + keystore signing, caching — is
 * identical across keychain / keystore-file / raw-privkey and lives here.
 */
export abstract class PrivkeyOperatorSigner implements OperatorSigner {
  abstract readonly source: string
  private cached: PrivateKey | null = null

  /** Subclass hook: yield a casper-js-sdk PrivateKey. Invoked at most once. */
  protected abstract loadPrivateKey(): Promise<PrivateKey>

  /**
   * Algorithm subclasses default to when constructing the key. Casper agent
   * wallets are secp256k1 by default to mirror the web derivation; operator
   * keys may be ed25519 or secp256k1 (subclasses can override per source).
   */
  protected algorithm: KeyAlgorithm = KeyAlgorithm.SECP256K1

  protected async getPrivateKey(): Promise<PrivateKey> {
    if (!this.cached) this.cached = await this.loadPrivateKey()
    return this.cached
  }

  async publicKeyHex(): Promise<string> {
    return (await this.getPrivateKey()).publicKey.toHex()
  }

  async account(): Promise<OperatorAccount> {
    const pk = await this.getPrivateKey()
    const publicKeyHex = pk.publicKey.toHex()
    return {
      publicKeyHex,
      async signMessage({ message }) {
        return bytesToHex(pk.sign(toBytes(message)))
      },
      async signKeystore({ agent, scope }) {
        return bytesToHex(pk.sign(toBytes(keystoreUnlockMessage(agent, scope))))
      },
    }
  }
}
