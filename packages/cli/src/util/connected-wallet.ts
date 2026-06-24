/**
 * Web-connected wallet (CSPR.click) — the read-only identity a user links via
 * `nebula connect` instead of pointing at a local PEM.
 *
 * `runConnect` writes `{ publicKey, connectedAt }` to ~/.nebula/connected-wallet.json.
 * These helpers read it back so the chat commands can use that public key for
 * read-only chain access. A real PEM (CASPER_SECRET_KEY_PATH) always wins; this
 * only ever supplies a read-only `pub`, never a signer. Web-based transaction
 * signing is a follow-up — the seam is `applyConnectedWalletEnv` doing nothing
 * when a signer is present.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface ConnectedWallet {
  /** Casper public key hex (01… ed25519 / 02… secp256k1). */
  publicKey: string
  /** ISO timestamp of the connect. */
  connectedAt: string
}

/** ~/.nebula/connected-wallet.json — the on-disk web-connect record. */
export function connectedWalletPath(): string {
  return path.join(os.homedir(), '.nebula', 'connected-wallet.json')
}

/** Read the connected wallet, or null when none is linked / the file is bad. */
export function loadConnectedWallet(): ConnectedWallet | null {
  try {
    const raw = fs.readFileSync(connectedWalletPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ConnectedWallet>
    if (typeof parsed.publicKey !== 'string' || !parsed.publicKey) return null
    return {
      publicKey: parsed.publicKey,
      connectedAt: typeof parsed.connectedAt === 'string' ? parsed.connectedAt : '',
    }
  } catch {
    return null
  }
}

/**
 * When no PEM is configured (CASPER_SECRET_KEY_PATH unset/empty) and no explicit
 * CASPER_PUBLIC_KEY is set, fall back to the web-connected wallet's public key so
 * `buildCasperOnchainFromEnv` picks it up as the read-only `pub`. A real PEM
 * always wins — we never overwrite an existing key. Returns the public key that
 * was applied, or null when nothing changed.
 */
export function applyConnectedWalletEnv(): string | null {
  const hasPem = !!process.env.CASPER_SECRET_KEY_PATH
  const hasPub = !!process.env.CASPER_PUBLIC_KEY
  if (hasPem || hasPub) return null
  const wallet = loadConnectedWallet()
  if (!wallet) return null
  process.env.CASPER_PUBLIC_KEY = wallet.publicKey
  return wallet.publicKey
}
