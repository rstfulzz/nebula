import { spawnSync } from 'node:child_process'
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk'
import { PrivkeyOperatorSigner } from './privkey-base'

/** Safe subset of characters allowed in a keychain service name. Rejects
 *  shell metacharacters so user-supplied service names can never inject.
 */
const SERVICE_NAME_RE = /^[a-zA-Z0-9._-]{1,128}$/

/**
 * Loads the operator private key from the macOS Keychain under a service name.
 *
 * First-class operator wallet source on macOS. Same trust model as a password
 * manager: the key is encrypted at rest by the OS, unlocked by the user's
 * login password, accessible to the process the user is running. Keychain
 * entries can optionally be gated by Touch ID.
 *
 * The stored secret is a Casper private key hex (32 bytes). Linux and Windows
 * equivalents (libsecret, Credential Manager) are post-MVP; non-macOS users
 * pick a keystore file or raw private key.
 *
 * Service name is user-chosen: we default to `nebula.operator` but the caller
 * can pass any string.
 */
export class KeychainOperatorSigner extends PrivkeyOperatorSigner {
  readonly source: string

  constructor(
    private readonly keychainService: string = 'nebula.operator',
    algorithm: KeyAlgorithm = KeyAlgorithm.SECP256K1,
  ) {
    super()
    if (!SERVICE_NAME_RE.test(keychainService)) {
      throw new Error(
        `Invalid keychain service name. Allowed: alphanumerics, dot, underscore, hyphen (max 128). Got: ${keychainService}`,
      )
    }
    this.algorithm = algorithm
    this.source = `keychain:${keychainService}`
  }

  protected async loadPrivateKey(): Promise<PrivateKey> {
    const result = spawnSync(
      'security',
      ['find-generic-password', '-s', this.keychainService, '-w'],
      { encoding: 'utf8' },
    )
    if (result.status !== 0) {
      throw new Error(
        `security find-generic-password failed for service '${this.keychainService}': ${result.stderr?.trim() || `exit ${result.status}`}`,
      )
    }
    const raw = result.stdout.trim().replace(/^0x/, '')
    return PrivateKey.fromHex(raw, this.algorithm)
  }
}
