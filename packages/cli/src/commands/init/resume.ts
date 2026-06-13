import { cancel, intro, note, outro, spinner } from '@clack/prompts'
import {
  type NebulaConfig,
  NETWORK_CHAIN_ID,
  agentPaths,
  explorerTxUrl,
  fetchAndDecryptKeystore,
  iNFTAgentId,
  openComputeLedger,
} from 'nebula-ai-core'
import type { Address, Hex } from 'viem'
import { loadOrPickOperatorSigner } from './operator-picker'
import { readWizardState, updateWizardState } from './wizard-state'

/**
 * Resume a partial `nebula init` that crashed after mint + funding. Phase 6.6
 * requires that the keystore was uploaded to Mantle Storage before resume can
 * proceed — otherwise the agent privkey is lost (it only existed in the
 * original wizard's RAM).
 */
export async function runResumeInit(opts: {
  config: NebulaConfig
  configPath: string
}): Promise<void> {
  intro('nebula init --resume')

  const { config } = opts
  if (!config.identity.iNFT || !config.identity.agent) {
    cancel('No iNFT or agent address in config. Nothing to resume — run `nebula init` fresh.')
    return
  }
  const network = config.network
  const contractAddress = config.identity.iNFT.contract as Address
  const tokenId = BigInt(config.identity.iNFT.tokenId)
  const agentAddress = config.identity.agent as Address
  const finalAgentId = iNFTAgentId({ contractAddress, tokenId })
  const paths = agentPaths.agent(finalAgentId)

  const state = await readWizardState(paths.dir)
  if (!state) {
    cancel(
      `No state file at ${paths.dir}. If init was never started, run \`nebula init\` without --resume.`,
    )
    return
  }

  if (!state.steps.mintTx || !state.steps.agentFundedTx) {
    cancel(
      'Mint or agent-funding did not complete. Resume only supports steps after funding. Start fresh with `nebula init` (pick Overwrite) and re-mint.',
    )
    return
  }

  if (!state.steps.keystorePersistedTx) {
    cancel(
      [
        'Keystore was never uploaded to Mantle Storage. The agent privkey only',
        "existed in the original wizard's RAM, so it is unrecoverable now.",
        'Start fresh with `nebula init` and re-mint into a new iNFT.',
      ].join(' '),
    )
    return
  }

  const operator = await loadOrPickOperatorSigner({ network, hint: config.operator })
  if (!operator) {
    cancel('No operator wallet available; cannot decrypt keystore to resume.')
    return
  }

  const sUnlock = spinner()
  sUnlock.start('Fetching keystore from Mantle Storage + decrypting via operator')
  let agentPrivkey: Hex
  try {
    const decrypted = await fetchAndDecryptKeystore({
      network,
      contractAddress,
      tokenId,
      signer: operator,
      agentAddress,
      cachePath: paths.keystore,
    })
    agentPrivkey = decrypted.privkeyHex
    sUnlock.stop(`unlocked (keystore source: ${decrypted.source})`)
  } catch (e) {
    sUnlock.stop(`unlock failed: ${(e as Error).message.slice(0, 160)}`)
    await operator.close?.()
    return
  }

  if (!state.steps.ledgerOpenedTx) {
    const s = spinner()
    s.start('Opening Mantle Compute ledger (3 Mantle minimum, top up later)')
    try {
      const status = await openComputeLedger({
        network,
        privkeyHex: agentPrivkey,
        initialBalance: 3,
        providerAddress: config.brain.provider ?? undefined,
      })
      await updateWizardState(paths.dir, draft => {
        draft.steps.ledgerOpenedTx = true
      })
      s.stop(
        status.alreadyExisted ? 'ledger already existed, topped up' : 'ledger opened with 3 Mantle',
      )
    } catch (e) {
      s.stop(`ledger open failed: ${(e as Error).message.slice(0, 120)}`)
    }
  }

  // Subname records are not resumable: the state file intentionally doesn't
  // persist the requested label, so if text records are incomplete we tell
  // the user to re-run `nebula init` and pick the same label manually.
  if (!state.steps.subnameClaimedTx) {
    note(
      'If you wanted a subname, re-run `nebula init` (it can re-pick the same label).',
      'subname not resumable',
    )
  }

  await operator.close?.()

  outro(
    [
      '',
      `  agent     ${agentAddress}`,
      `  iNFT      #${tokenId.toString()} at ${contractAddress}`,
      `  tx        ${explorerTxUrl(network, state.steps.mintTx as Hex)}`,
      `  keystore  ${paths.keystore} (cache of Mantle Storage blob)`,
      `  chain id  ${NETWORK_CHAIN_ID[network]}`,
      '',
      'Resume finished. `nebula` to chat, `nebula status` for health.',
    ].join('\n'),
  )
}
