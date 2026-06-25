/**
 * The delegated treasury agent key — the second key in the "one user, one
 * wallet, one agent" mode. The owner registers this key against their on-chain
 * budget; thereafter the agent signs `execute` calls to spend within the
 * contract-enforced caps. It is intentionally separate from the owner's
 * CASPER_SECRET_KEY_PATH: it can only move budget funds the contract allows,
 * and the owner can revoke it on-chain.
 *
 * The key is persisted (unencrypted, test-grade) at `~/.nebula/treasury-agent.pem`
 * so the agent reuses the same identity across runs. casper-js-sdk's PrivateKey
 * exposes `toPem()`, so we don't need to shell out to openssl.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk'

export interface TreasuryAgent {
  /** The agent signer (secp256k1). */
  signer: PrivateKey
  /** The agent's public key hex (`02…`) — registered against the owner's budget. */
  publicKeyHex: string
}

/** `~/.nebula/treasury-agent.pem` — the on-disk delegated-agent key. */
export function treasuryAgentPath(): string {
  return path.join(os.homedir(), '.nebula', 'treasury-agent.pem')
}

/**
 * Load the treasury agent key, generating + persisting a fresh secp256k1 key on
 * first use. Returns the signer + its public key hex.
 */
export async function loadOrCreateTreasuryAgent(): Promise<TreasuryAgent> {
  const pemPath = treasuryAgentPath()
  if (fs.existsSync(pemPath)) {
    const signer = PrivateKey.fromPem(fs.readFileSync(pemPath, 'utf8'), KeyAlgorithm.SECP256K1)
    return { signer, publicKeyHex: signer.publicKey.toHex() }
  }
  const signer = PrivateKey.generate(KeyAlgorithm.SECP256K1)
  fs.mkdirSync(path.dirname(pemPath), { recursive: true })
  fs.writeFileSync(pemPath, signer.toPem(), { mode: 0o600 })
  return { signer, publicKeyHex: signer.publicKey.toHex() }
}
