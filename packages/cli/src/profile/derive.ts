/**
 * Deterministic agent wallet derivation — MUST stay byte-for-byte identical to
 * the web (apps/web/lib/agent-wallet.ts) so the same operator/main wallet
 * resolves to the SAME Casper agent wallet in the CLI and the browser.
 *
 * The operator signs the fixed message; blake2b-256 (Casper's hash) of that
 * signature is the agent's secp256k1 private-key scalar. The public key is the
 * Casper secp256k1 key (hex, `02…`-prefixed).
 */
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk'

// KEEP IN SYNC with apps/web/lib/agent-wallet.ts AGENT_DERIVE_MESSAGE.
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
 * Derive a 32-byte secp256k1 private-key scalar (hex) from a wallet signature.
 * Uses blake2b-256 (Casper's hash) over the signature bytes — identical to the
 * web derivation so the CLI and browser resolve to one agent wallet.
 */
export async function deriveAgentKeyFromSignature(signatureHex: string): Promise<string> {
  const { blake2b } = await import('@noble/hashes/blake2.js')
  return bytesToHex(blake2b(hexToBytes(signatureHex), { dkLen: 32 }))
}

/**
 * Derive the Casper agent key pair from a main-wallet signature. Returns the
 * casper-js-sdk PrivateKey, its public key hex (`02…` secp256k1), and an
 * `address` alias (the public key hex) for call sites that key off an address.
 */
export async function deriveAgentAccountFromSignature(signatureHex: string): Promise<{
  privateKey: PrivateKey
  publicKeyHex: string
  address: string
}> {
  const hex = await deriveAgentKeyFromSignature(signatureHex)
  const privateKey = PrivateKey.fromHex(hex, KeyAlgorithm.SECP256K1)
  const publicKeyHex = privateKey.publicKey.toHex()
  return { privateKey, publicKeyHex, address: publicKeyHex }
}
