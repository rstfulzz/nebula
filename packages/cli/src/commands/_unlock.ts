import { readFile } from 'node:fs/promises'
import { spinner } from '@clack/prompts'
import {
  type NebulaConfig,
  type NebulaNetwork,
  agentPaths,
  decodeKeystoreBytes,
  decryptAgentKey,
  placeholderAgentId,
} from 'nebula-ai-core'
import { withSilencedConsole } from '../util/silence-console'
import { loadOrPickOperatorSigner } from './init/operator-picker'

export interface UnlockedAgent {
  /** Hex-encoded Casper secp256k1 private key. */
  agentPrivkey: string
  /** Agent public key hex / account-hash. */
  agentAddress: string
  network: NebulaNetwork
  close: () => Promise<void>
}

/**
 * Shared operator-unlock dance for any command that needs the agent privkey:
 *  1. pick the operator signer (keystore / WC / keychain) per config hint
 *  2. read the local encrypted keystore cache
 *  3. decrypt via operator signature
 *
 * Returns null if the operator picker is cancelled or the keystore can't be
 * decrypted; caller should bail out early on null.
 *
 * Caller MUST call `close()` once done with the privkey, even on success, to
 * release WC sessions / keystore tmpfiles.
 */
export async function unlockAgentSigner(
  config: NebulaConfig,
  spinnerLabel = 'Decrypting agent keystore via operator wallet',
): Promise<UnlockedAgent | null> {
  if (!config.identity.agent) return null
  const network = config.network
  const agentAddress = config.identity.agent
  const agentId = placeholderAgentId(agentAddress)
  const paths = agentPaths.agent(agentId)

  const operator = await loadOrPickOperatorSigner({ network, hint: config.operator })
  if (!operator) return null

  const close = async () => {
    await operator.close?.()
  }

  const s = spinner()
  s.start(spinnerLabel)
  try {
    const agentPrivkey = await withSilencedConsole(async (): Promise<string> => {
      const raw = await readFile(paths.keystore, 'utf8')
      const keystore = decodeKeystoreBytes(new TextEncoder().encode(raw))
      // The core keystore API is still typed with viem's `0x${string}`; our
      // Casper public-key hex is a plain string, cast at the boundary.
      return await decryptAgentKey({
        signer: operator,
        agentAddress: agentAddress as `0x${string}`,
        keystore,
      })
    })
    s.stop('unlocked (keystore source: local)')
    return { agentPrivkey, agentAddress, network, close }
  } catch (e) {
    s.stop(`unlock failed: ${(e as Error).message.slice(0, 160)}`)
    await close()
    return null
  }
}
