import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { OperatorSigner } from '../operator/signer'
import {
  type OperatorEncryptedKeystore,
  encodeKeystoreBytes,
  encryptAgentKey,
} from '../wallet/operator-keystore-crypto'

/**
 * Local encrypted-keystore lifecycle.
 *
 * The agent's private key is encrypted to the operator wallet and stored as a
 * local file at `~/.nebula/agents/<id>/keystore.json`. The ciphertext is
 * decryptable only by the operator's wallet signature (sign-derived key, see
 * operator-keystore-crypto.ts). Keys never leave RAM in plaintext.
 */

/** Write an encrypted keystore JSON to `cachePath`, mkdir-p'ing the parent. */
async function writeKeystoreCache(
  cachePath: string,
  keystore: OperatorEncryptedKeystore,
): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(keystore, null, 2), 'utf8')
}

/**
 * Encrypt the agent privkey to the operator wallet and save the ciphertext
 * to a local file. Performs ZERO chain or storage operations.
 *
 * **Call this BEFORE funding the agent EOA.** The encrypted keystore on disk
 * is the durable insurance against any subsequent failure: once it exists,
 * the operator wallet can always decrypt + recover the agent privkey, even
 * if any later step blows up.
 */
export async function saveKeystoreLocally(opts: {
  signer?: OperatorSigner
  /** Agent public key hex (or account hash). */
  agentAddress: string
  /** Agent private key hex. */
  agentPrivkey: string
  cachePath: string
  /**
   * Optional pre-derived AES key (32 bytes). When provided, the caller has
   * already derived the keystore-scope key via `precomputeAllScopes` and wants
   * to avoid a second operator signature. Used by `nebula init` so the
   * operator-session cache and the encrypted keystore share the same derive.
   */
  precomputedKey?: Buffer
}): Promise<{ keystore: OperatorEncryptedKeystore; bytes: Uint8Array }> {
  const keystore = await encryptAgentKey({
    signer: opts.signer,
    agentAddress: opts.agentAddress,
    agentPrivkey: opts.agentPrivkey,
    precomputedKey: opts.precomputedKey,
  })
  await writeKeystoreCache(opts.cachePath, keystore)
  const bytes = encodeKeystoreBytes(keystore)
  return { keystore, bytes }
}
