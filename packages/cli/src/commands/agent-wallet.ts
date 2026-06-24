/**
 * `nebula agent` — derive and show the deterministic Casper agent wallet from
 * the operator signature (the SAME wallet the web console derives from this
 * wallet), and optionally set it as the active agent. Setting it writes the
 * derived secp256k1 key to a local encrypted keystore and points the config at
 * it, so an unchanged `nebula chat` then transacts as the derived wallet.
 *
 * On Casper the agent key is a secp256k1 private key; the "address" is the
 * agent's public key hex (`02…`). The operator signs `AGENT_DERIVE_MESSAGE`;
 * blake2b-256 of that signature is the agent key (mirrors apps/web).
 */
import { confirm, isCancel, note, spinner } from '@clack/prompts'
import { PublicKey } from 'casper-js-sdk'
import { agentPaths, placeholderAgentId, saveKeystoreLocally } from 'nebula-ai-core'
import { getBalanceMotes, makeRpc, motesToCspr } from 'nebula-ai-plugin-onchain'
import { findAndLoadConfig } from '../config/load'
import { writeConfigTs } from '../config/render'
import {
  AGENT_DERIVE_MESSAGE,
  deriveAgentAccountFromSignature,
  deriveAgentKeyFromSignature,
} from '../profile/derive'
import { loadOrPickOperatorSigner } from './init/operator-picker'

export async function runAgentWallet(): Promise<void> {
  const found = await findAndLoadConfig(process.cwd())
  if (!found) {
    console.log('No nebula.config.ts found. Run `nebula init` first.')
    return
  }
  const { config, path: configPath } = found
  const operator = await loadOrPickOperatorSigner({
    network: config.network,
    hint: config.operator,
  })
  if (!operator) {
    console.log('No operator wallet available to sign.')
    return
  }
  const s = spinner()
  s.start('Signing to derive your agent wallet')
  try {
    const account = await operator.account()
    const sig = await account.signMessage({ message: AGENT_DERIVE_MESSAGE })
    const derivedKey = await deriveAgentKeyFromSignature(sig)
    const derived = await deriveAgentAccountFromSignature(sig)
    const derivedPubKeyHex = derived.publicKeyHex

    let balLine = ''
    try {
      const motes = await getBalanceMotes(makeRpc(), PublicKey.fromHex(derivedPubKeyHex))
      balLine = `\nbalance: ${motesToCspr(motes)} CSPR`
    } catch {}
    s.stop('derived')

    const isActive = config.identity.agent?.toLowerCase() === derivedPubKeyHex.toLowerCase()
    note(
      `${derivedPubKeyHex}${balLine}\n\nThis is the same agent wallet the web console derives from this wallet.${
        isActive ? '\n✓ already your active agent.' : ''
      }\nFund it with a little CSPR to let the agent transact.`,
      'agent wallet',
    )

    if (isActive) return

    const set = await confirm({
      message: 'Set this as your active agent wallet? (nebula chat will run as it)',
      initialValue: false,
    })
    if (isCancel(set) || !set) return

    const agentId = placeholderAgentId(derivedPubKeyHex)
    const paths = agentPaths.agent(agentId)
    const sSet = spinner()
    sSet.start('Saving the derived agent keystore + updating config')
    await saveKeystoreLocally({
      signer: operator,
      // Core keystore API is still typed with viem's `0x${string}`; our Casper
      // public-key hex + secp256k1 privkey hex are plain strings.
      agentAddress: derivedPubKeyHex as `0x${string}`,
      agentPrivkey: derivedKey as `0x${string}`,
      cachePath: paths.keystore,
    })
    await writeConfigTs(
      configPath,
      { ...config, identity: { ...config.identity, agent: derivedPubKeyHex } },
      { header: '// Updated by `nebula agent` — active agent set to the derived wallet.' },
    )
    sSet.stop('done')
    note('`nebula chat` now runs as your derived agent wallet (same as the web).', 'agent wallet')
  } catch (e) {
    s.stop(`failed: ${(e as Error).message.slice(0, 140)}`)
  } finally {
    await operator.close?.()
  }
}
