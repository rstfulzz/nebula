// Per-browser cache of agent accounts keyed by identity token id.
// Populated by registry reverse-lookup or by operator manual paste.
// Stored in localStorage so the second visit skips the lookup work.
//
// On Casper the "agent account" is a public key hex (01… ed25519 / 02… secp256k1).

const KEY_PREFIX = 'nebula.console.agent-account.'

/** A Casper public key hex: 01-prefixed (66 hex) or 02-prefixed (68 hex). */
export function isValidPublicKey(s: string): boolean {
  return /^01[0-9a-fA-F]{64}$/.test(s) || /^02[0-9a-fA-F]{66}$/.test(s)
}

export function readAgentAccount(tokenId: bigint): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY_PREFIX + tokenId.toString())
    if (!raw) return null
    if (!isValidPublicKey(raw)) return null
    return raw
  } catch {
    return null
  }
}

export function writeAgentAccount(tokenId: bigint, publicKey: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY_PREFIX + tokenId.toString(), publicKey)
  } catch {
    // ignore quota errors
  }
}

export function clearAgentAccount(tokenId: bigint) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY_PREFIX + tokenId.toString())
  } catch {
    // ignore
  }
}
