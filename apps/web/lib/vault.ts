// Envelope encryption for delegated agent keys (the Hybrid model's ONLY custody
// point: headless Telegram sessions). AES-256-GCM with a server master key. The
// plaintext agent key only ever exists in memory during a request; at rest it is
// sealed. Rotating NEBULA_VAULT_KEY invalidates all sealed blobs (forces re-pair).
//
// Production hardening path: swap the env master key for a KMS/HSM-backed key
// (AWS KMS / GCP KMS / Vault Transit) — the seal()/open() interface stays the same.
import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function masterKey(): Buffer {
  const hex = process.env.NEBULA_VAULT_KEY
  if (!hex || hex.length < 64) {
    throw new Error('NEBULA_VAULT_KEY missing or too short — need 64 hex chars (32 bytes). Generate: openssl rand -hex 32')
  }
  return Buffer.from(hex.slice(0, 64), 'hex')
}

/** Seal a secret → `iv.tag.ciphertext` (all hex). Authenticated (GCM). */
export function seal(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}.${tag.toString('hex')}.${ct.toString('hex')}`
}

/** Open a sealed blob. Throws if tampered (auth tag mismatch) or wrong key. */
export function open(sealed: string): string {
  const [ivh, tagh, cth] = sealed.split('.')
  if (!ivh || !tagh || !cth) throw new Error('malformed sealed blob')
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivh, 'hex'))
  decipher.setAuthTag(Buffer.from(tagh, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(cth, 'hex')), decipher.final()]).toString('utf8')
}

/** True when a vault key is configured (gates the Telegram bridge entirely). */
export function vaultReady(): boolean {
  return !!process.env.NEBULA_VAULT_KEY && process.env.NEBULA_VAULT_KEY.length >= 64
}
