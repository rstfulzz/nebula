/**
 * `nebula agent` — derive and show the deterministic agent wallet from the
 * operator signature. It's the SAME wallet the web console derives from the same
 * wallet, so you can confirm they match (and fund it).
 */
import { note, spinner } from '@clack/prompts'
import { formatEther } from 'viem'
import { findAndLoadConfig } from '../config/load'
import { AGENT_DERIVE_MESSAGE, deriveAgentAccountFromSignature } from '../profile/derive'
import { loadOrPickOperatorSigner } from './init/operator-picker'

export async function runAgentWallet(): Promise<void> {
  const found = await findAndLoadConfig(process.cwd())
  if (!found) {
    console.log('No nebula.config.ts found. Run `nebula init` first.')
    return
  }
  const config = found.config
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
    const sig = (await account.signMessage({ message: AGENT_DERIVE_MESSAGE })) as `0x${string}`
    const agent = deriveAgentAccountFromSignature(sig)
    let balLine = ''
    try {
      const pub = await operator.publicClient(config.network)
      const bal = await pub.getBalance({ address: agent.address })
      balLine = `\nbalance: ${formatEther(bal)} MNT`
    } catch {}
    s.stop('derived')
    note(
      `${agent.address}${balLine}\n\nThis is the same agent wallet the web console derives from this wallet.\nFund it with a little MNT to let the agent transact on your behalf.`,
      'agent wallet',
    )
  } catch (e) {
    s.stop(`failed: ${(e as Error).message.slice(0, 140)}`)
  } finally {
    await operator.close?.()
  }
}
