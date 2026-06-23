// Casper sign-in message construction + signature verification via casper-js-sdk.
// The client signs a nonce message with CSPR.click; the server verifies the
// signature against the account's public key.

import 'server-only'
import { PublicKey } from 'casper-js-sdk'

// Re-export the canonical message builder (shared with the client).
export { SIGN_IN_STATEMENT, buildSignInMessage } from './build-message'

export type SignInVerifyResult =
  | { ok: true; publicKey: string }
  | { ok: false; reason: string }

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/**
 * Strip the 1-byte key-algorithm tag a Casper wallet may prepend to a signature
 * (01 = ed25519, 02 = secp256k1). casper-js-sdk's `verifySignature` wants the
 * raw signature bytes.
 */
function normalizeSignature(sigHex: string, expectedRawLen: number): Uint8Array {
  const bytes = hexToBytes(sigHex)
  if (bytes.length === expectedRawLen + 1 && (bytes[0] === 0x01 || bytes[0] === 0x02)) {
    return bytes.slice(1)
  }
  return bytes
}

/**
 * Verify a Casper sign-in message + signature.
 *
 * Checks the embedded nonce/domain match what the server issued, then verifies
 * the signature against the given public key. Casper Wallet signs the message
 * wrapped as `"Casper Message:\n" + message`; we try both the wrapped and raw
 * forms for cross-wallet compatibility.
 */
export async function verifyCasperSignIn(
  rawMessage: string,
  signatureHex: string,
  publicKeyHex: string,
  expectedNonce: string,
  expectedDomain: string,
): Promise<SignInVerifyResult> {
  // Parse the nonce/domain out of the message and check them.
  const lines = rawMessage.split('\n')
  const domainLine = lines[0] ?? ''
  if (!domainLine.startsWith(`${expectedDomain} wants you to sign in`)) {
    return { ok: false, reason: 'domain mismatch' }
  }
  const nonceLine = lines.find(l => l.startsWith('Nonce: '))
  const nonce = nonceLine?.slice('Nonce: '.length)
  if (nonce !== expectedNonce) {
    return { ok: false, reason: 'nonce mismatch' }
  }
  const subject = lines[1]
  if (subject !== publicKeyHex) {
    return { ok: false, reason: 'public key mismatch' }
  }

  let pubKey: PublicKey
  try {
    pubKey = PublicKey.fromHex(publicKeyHex)
  } catch (err) {
    return { ok: false, reason: `bad public key: ${(err as Error).message}` }
  }

  // ed25519 sig is 64 bytes; secp256k1 is 64 bytes too (r||s).
  const sigBytes = normalizeSignature(signatureHex, 64)
  const enc = new TextEncoder()
  const candidates = [enc.encode(rawMessage), enc.encode(`Casper Message:\n${rawMessage}`)]
  for (const msgBytes of candidates) {
    try {
      if (pubKey.verifySignature(msgBytes, sigBytes)) {
        return { ok: true, publicKey: publicKeyHex }
      }
    } catch {
      // try the next wrapping
    }
  }
  return { ok: false, reason: 'signature invalid' }
}

export function randomNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
