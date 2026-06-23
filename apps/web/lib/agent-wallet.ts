// Deterministic Casper agent wallet, derived from a signature by the user's main
// wallet over a fixed message. The same main wallet always yields the same agent
// wallet — so the web and the CLI (which signs the identical message) resolve to
// the SAME agent wallet, with nothing stored or copied between them.
//
// On Casper the agent key is a secp256k1 private key: blake2b(signature) gives a
// 32-byte scalar; the public key is the secp256k1 key (hex-prefixed `02`).

import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk'

// Versioned + explicit so the user knows what they're signing. Changing this
// string changes the derived wallet — keep it stable.
export const AGENT_DERIVE_MESSAGE =
  'nebula · derive my agent wallet (v1)\n\n' +
  'Signing this proves you own this wallet and unlocks your deterministic Casper ' +
  'agent wallet. This signature IS your agent key — only ever sign it on nebula.'

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

/**
 * Derive a 32-byte secp256k1 private-key scalar from a wallet signature.
 * Uses blake2b-256 (Casper's hash) over the signature bytes.
 */
export async function deriveAgentPrivateKeyBytes(signatureHex: string): Promise<Uint8Array> {
  const { blake2b } = await import('@noble/hashes/blake2.js')
  return blake2b(hexToBytes(signatureHex), { dkLen: 32 })
}

/** Derive the agent's secp256k1 private key (hex) from a main-wallet signature. */
export async function deriveAgentPrivateKey(signatureHex: string): Promise<string> {
  const bytes = await deriveAgentPrivateKeyBytes(signatureHex)
  return bytesToHex(bytes)
}

/**
 * Derive the agent key pair from a main-wallet signature.
 * Returns the casper-js-sdk PrivateKey and its public key hex (02… secp256k1).
 */
export async function deriveAgentAccount(
  signatureHex: string,
): Promise<{ privateKey: PrivateKey; publicKeyHex: string }> {
  const hex = await deriveAgentPrivateKey(signatureHex)
  const privateKey = PrivateKey.fromHex(hex, KeyAlgorithm.SECP256K1)
  return { privateKey, publicKeyHex: privateKey.publicKey.toHex() }
}
