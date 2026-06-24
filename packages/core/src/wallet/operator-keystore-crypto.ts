import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import type { OperatorSigner } from '../operator/signer'

/**
 * Operator keystore: the agent's private key encrypted with a key derived from
 * a deterministic operator signature.
 *
 * Why sign-derived-key? It works the same way for every operator source we
 * support (raw private key, keystore PEM, keychain) without needing the
 * operator's signature ahead of time. The operator signs a structured
 * keystore-unlock message embedding the agent public key + scope; HKDF-SHA256
 * over the signature yields the AES-256 key.
 *
 * Determinism: Casper signing is deterministic — Ed25519 is inherently
 * deterministic, and casper-js-sdk's secp256k1 path uses RFC-6979 (deterministic
 * k). So the same operator key + same message always regenerates the same key.
 *
 * Scope separation: each scope is part of the signed message, so a signature for
 * one scope can't decrypt another. New scopes get their own derived key.
 *
 * Format:
 *   raw blob bytes = iv(12) || tag(16) || ciphertext
 *   on-disk JSON   = { version: 2, blob: base64(raw blob bytes) }
 */
export const OPERATOR_KEYSTORE_VERSION = 2 as const

const KS_PURPOSE = 'nebula-keystore-v1'
const HKDF_INFO_KEYSTORE = Buffer.from('nebula-keystore-aead-v1', 'utf8')

/**
 * Scope strings used to domain-separate derived keys. Each scope's signature
 * (and therefore HKDF output) is distinct, so a key derived for one scope
 * cannot decrypt another. Add new scopes here as needed.
 */
export const OPERATOR_BLOB_SCOPES = {
  KEYSTORE: 'nebula-keystore-v1',
  TELEGRAM: 'nebula-telegram-v1',
  PROFILE: 'nebula-profile-v1',
} as const
export type OperatorBlobScope =
  | (typeof OPERATOR_BLOB_SCOPES)[keyof typeof OPERATOR_BLOB_SCOPES]
  | string

export interface OperatorEncryptedKeystore {
  version: typeof OPERATOR_KEYSTORE_VERSION
  /** Base64 of `iv(12) || tag(16) || ciphertext`. */
  blob: string
}

/**
 * Versioned, scoped operator-encrypted blob. Used for non-keystore secrets
 * (e.g. telegram bot token + allowlisted user ids).
 *
 * `scope` is the keystore-unlock `purpose` used to derive the AEAD key, and is
 * persisted on disk so the loader routes to the correct decrypt scope without
 * prompting twice.
 */
export interface OperatorEncryptedBlob {
  version: typeof OPERATOR_KEYSTORE_VERSION
  scope: OperatorBlobScope
  /** Base64 of `iv(12) || tag(16) || ciphertext`. */
  blob: string
}

function hexToBytes(hex: string): Buffer {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  return Buffer.from(clean, 'hex')
}

/**
 * HKDF-SHA256 the operator signature into a 32-byte AES key. The signature is
 * the deterministic Casper signature over the keystore-unlock message (64 raw
 * bytes for both ed25519 and secp256k1); used directly as the IKM.
 */
function hkdfKeyFromSigHex(sigHex: string, info: Buffer): Buffer {
  const ikm = hexToBytes(sigHex)
  if (ikm.length < 32) {
    throw new Error(
      `Operator signature has unexpected length: ${ikm.length} bytes (expected >= 32). This source may not produce a Casper signature; switch operator wallets.`,
    )
  }
  return Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(0), info, 32))
}

function hkdfInfoForScope(scope: OperatorBlobScope): Buffer {
  return Buffer.from(`nebula-aead-${scope}`, 'utf8')
}

async function deriveScopedKey(
  signer: OperatorSigner,
  scope: OperatorBlobScope,
  agent: string,
): Promise<Buffer> {
  const account = await signer.account()
  const sigHex = await account.signKeystore({ agent, scope })
  return hkdfKeyFromSigHex(sigHex, hkdfInfoForScope(scope))
}

async function deriveKey(signer: OperatorSigner, agent: string): Promise<Buffer> {
  // Uses HKDF_INFO_KEYSTORE (not the per-scope info) for the canonical legacy
  // keystore slot, keeping the on-disk format stable for the keystore scope.
  const account = await signer.account()
  const sigHex = await account.signKeystore({ agent, scope: KS_PURPOSE })
  return hkdfKeyFromSigHex(sigHex, HKDF_INFO_KEYSTORE)
}

export async function encryptAgentKey(opts: {
  signer?: OperatorSigner
  /** Agent public key hex (or account hash). */
  agentAddress: string
  /** Agent private key hex. */
  agentPrivkey: string
  /**
   * Optional pre-derived AES-256 key (32 bytes). When present, skips the
   * operator signature entirely. Used by `nebula init` so the operator-session
   * cache and the encrypted keystore share one derivation (the operator signs
   * once, not twice).
   */
  precomputedKey?: Buffer
}): Promise<OperatorEncryptedKeystore> {
  let key: Buffer
  if (opts.precomputedKey) {
    if (opts.precomputedKey.length !== 32) {
      throw new Error(`Precomputed key must be 32 bytes, got ${opts.precomputedKey.length}`)
    }
    key = opts.precomputedKey
  } else {
    if (!opts.signer) {
      throw new Error('encryptAgentKey requires either signer or precomputedKey')
    }
    key = await deriveKey(opts.signer, opts.agentAddress)
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const pt = hexToBytes(opts.agentPrivkey)
  const ct = Buffer.concat([cipher.update(pt), cipher.final()])
  const tag = cipher.getAuthTag()
  const blob = Buffer.concat([iv, tag, ct]).toString('base64')
  return { version: OPERATOR_KEYSTORE_VERSION, blob }
}

function decryptAesGcmStrict(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()])
}

export async function decryptAgentKey(opts: {
  signer?: OperatorSigner
  /** Agent public key hex (or account hash). */
  agentAddress: string
  keystore: OperatorEncryptedKeystore
  /**
   * Optional pre-derived AES-256 key (32 bytes). When present, skips the
   * operator signature entirely. Used by the headless gateway path: a prior
   * interactive unlock derives the key once via the operator signer, persists
   * it in the operator-session file, and the daemon reads it from there at boot.
   */
  precomputedKey?: Buffer
}): Promise<string> {
  if (opts.keystore.version !== OPERATOR_KEYSTORE_VERSION) {
    throw new Error(
      `Unsupported operator keystore version: ${opts.keystore.version} (expected ${OPERATOR_KEYSTORE_VERSION}).`,
    )
  }
  const buf = Buffer.from(opts.keystore.blob, 'base64')
  if (buf.length < 12 + 16 + 1) {
    throw new Error(`Operator keystore blob too short: ${buf.length} bytes`)
  }
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct = buf.subarray(28)
  let key: Buffer
  if (opts.precomputedKey) {
    if (opts.precomputedKey.length !== 32) {
      throw new Error(`Precomputed key must be 32 bytes, got ${opts.precomputedKey.length}`)
    }
    key = opts.precomputedKey
  } else {
    if (!opts.signer) {
      throw new Error('decryptAgentKey requires either signer or precomputedKey')
    }
    key = await deriveKey(opts.signer, opts.agentAddress)
  }
  const pt = decryptAesGcmStrict(key, iv, tag, ct)
  return pt.toString('hex')
}

export function encodeKeystoreBytes(ks: OperatorEncryptedKeystore): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(ks))
}

export function decodeKeystoreBytes(bytes: Uint8Array): OperatorEncryptedKeystore {
  const parsed = JSON.parse(new TextDecoder().decode(bytes))
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Keystore bytes do not parse to an object')
  }
  if (parsed.version !== OPERATOR_KEYSTORE_VERSION) {
    throw new Error(
      `Keystore bytes have version ${parsed.version}, expected ${OPERATOR_KEYSTORE_VERSION}`,
    )
  }
  if (typeof parsed.blob !== 'string') {
    throw new Error('Keystore bytes have invalid blob field')
  }
  return parsed as OperatorEncryptedKeystore
}

/**
 * Encrypt an arbitrary operator-owned secret blob with a scope-derived key.
 * Used to persist e.g. `{telegram: {botToken, allowedUserIds}}` to
 * `~/.nebula/agents/<id>/telegram-secrets.encrypted`.
 *
 * Each scope (`OPERATOR_BLOB_SCOPES.*`) gets its own signature + HKDF output. A
 * signature obtained for one scope cannot decrypt another.
 */
export async function encryptOperatorBlob(opts: {
  signer?: OperatorSigner
  scope: OperatorBlobScope
  /** Agent public key hex (or account hash). */
  agentAddress?: string
  plaintext: Uint8Array
  /** Pre-derived scope key (32 bytes). When provided, skips signer derivation. */
  precomputedKey?: Buffer
}): Promise<OperatorEncryptedBlob> {
  let key: Buffer
  if (opts.precomputedKey) {
    if (opts.precomputedKey.length !== 32) {
      throw new Error(`Precomputed key must be 32 bytes, got ${opts.precomputedKey.length}`)
    }
    key = opts.precomputedKey
  } else {
    if (!opts.signer || !opts.agentAddress) {
      throw new Error('encryptOperatorBlob requires either signer+agentAddress or precomputedKey')
    }
    key = await deriveScopedKey(opts.signer, opts.scope, opts.agentAddress)
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(opts.plaintext)), cipher.final()])
  const tag = cipher.getAuthTag()
  const blob = Buffer.concat([iv, tag, ct]).toString('base64')
  return { version: OPERATOR_KEYSTORE_VERSION, scope: opts.scope, blob }
}

export async function decryptOperatorBlob(opts: {
  signer?: OperatorSigner
  scope: OperatorBlobScope
  /** Agent public key hex (or account hash). */
  agentAddress: string
  blob: OperatorEncryptedBlob
  /** Pre-derived scope key (32 bytes). Skips signer when present. */
  precomputedKey?: Buffer
}): Promise<Uint8Array> {
  if (opts.blob.version !== OPERATOR_KEYSTORE_VERSION) {
    throw new Error(
      `Unsupported operator blob version: ${opts.blob.version} (expected ${OPERATOR_KEYSTORE_VERSION}).`,
    )
  }
  if (opts.blob.scope !== opts.scope) {
    throw new Error(
      `Operator blob scope mismatch: blob has '${opts.blob.scope}', expected '${opts.scope}'. Refusing to decrypt across scopes.`,
    )
  }
  const buf = Buffer.from(opts.blob.blob, 'base64')
  if (buf.length < 12 + 16 + 1) {
    throw new Error(`Operator blob too short: ${buf.length} bytes`)
  }
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct = buf.subarray(28)
  let key: Buffer
  if (opts.precomputedKey) {
    if (opts.precomputedKey.length !== 32) {
      throw new Error(`Precomputed key must be 32 bytes, got ${opts.precomputedKey.length}`)
    }
    key = opts.precomputedKey
  } else {
    if (!opts.signer) {
      throw new Error('decryptOperatorBlob requires either signer or precomputedKey')
    }
    key = await deriveScopedKey(opts.signer, opts.scope, opts.agentAddress)
  }
  const pt = decryptAesGcmStrict(key, iv, tag, ct)
  return new Uint8Array(pt)
}

export function encodeOperatorBlobBytes(blob: OperatorEncryptedBlob): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(blob))
}

export function decodeOperatorBlobBytes(bytes: Uint8Array): OperatorEncryptedBlob {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('Operator blob bytes do not parse to an object')
  }
  if (parsed.version !== OPERATOR_KEYSTORE_VERSION) {
    throw new Error(
      `Operator blob version mismatch: got ${parsed.version}, expected ${OPERATOR_KEYSTORE_VERSION}`,
    )
  }
  if (typeof parsed.scope !== 'string' || typeof parsed.blob !== 'string') {
    throw new Error('Operator blob bytes have invalid scope/blob fields')
  }
  return parsed as unknown as OperatorEncryptedBlob
}

/**
 * Derive the keystore AES key for `decryptAgentKey`. Public so the
 * operator-session writer can pre-derive once and cache; the headless gateway
 * boots from the cached key.
 */
export async function deriveKeystoreKey(signer: OperatorSigner, agent: string): Promise<Buffer> {
  return deriveKey(signer, agent)
}

/**
 * Derive a scope-specific AES key for `decryptOperatorBlob`. Same caching use
 * case as `deriveKeystoreKey`.
 */
export async function deriveBlobKey(
  signer: OperatorSigner,
  agent: string,
  scope: OperatorBlobScope,
): Promise<Buffer> {
  return deriveScopedKey(signer, scope, agent)
}

/**
 * Trial-decrypt a keystore blob with a candidate AES key. Returns true on
 * success, false on AES-GCM auth failure or any malformed-input issue. Used by
 * the verify-and-swap path to detect whether a freshly derived key actually
 * decrypts the on-disk keystore.
 */
export function tryDecryptKeystoreWithKey(
  keystore: OperatorEncryptedKeystore,
  key: Buffer,
): boolean {
  if (keystore.version !== OPERATOR_KEYSTORE_VERSION) return false
  if (key.length !== 32) return false
  const buf = Buffer.from(keystore.blob, 'base64')
  if (buf.length < 12 + 16 + 1) return false
  try {
    decryptAesGcmStrict(key, buf.subarray(0, 12), buf.subarray(12, 28), buf.subarray(28))
    return true
  } catch {
    return false
  }
}

/**
 * Same as `tryDecryptKeystoreWithKey` for a scoped operator blob. Verifies the
 * blob's stored scope matches `expectedScope` before attempting decrypt so a
 * key derived for one scope can't accidentally "verify" against another scope.
 */
export function tryDecryptOperatorBlobWithKey(
  blob: OperatorEncryptedBlob,
  key: Buffer,
  expectedScope: OperatorBlobScope,
): boolean {
  if (blob.version !== OPERATOR_KEYSTORE_VERSION) return false
  if (blob.scope !== expectedScope) return false
  if (key.length !== 32) return false
  const buf = Buffer.from(blob.blob, 'base64')
  if (buf.length < 12 + 16 + 1) return false
  try {
    decryptAesGcmStrict(key, buf.subarray(0, 12), buf.subarray(12, 28), buf.subarray(28))
    return true
  } catch {
    return false
  }
}

/**
 * Sniff the keystore version of a serialized blob without doing any crypto.
 * Used by recovery/migration paths to branch on the on-disk version.
 */
export function sniffKeystoreVersion(bytes: Uint8Array): number | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.version === 'number') {
      return parsed.version
    }
    return null
  } catch {
    return null
  }
}
