/**
 * `nebula drain --to <hex-public-key>` — sweep the agent's CSPR (minus a gas
 * reserve) to a target, verified on-chain.
 */
import { cancel, confirm, intro, isCancel, log, outro, spinner } from '@clack/prompts'
import {
  buildCasperOnchainFromEnv,
  csprToMotes,
  getBalanceMotes,
  motesToCspr,
  transferCspr,
  waitForExecution,
} from 'nebula-ai-plugin-onchain'

export interface DrainOpts {
  /** Target hex public key. */
  to?: string
  /** Skip the destructive confirmation prompt. */
  yes?: boolean
}

export async function runDrain(opts: DrainOpts): Promise<void> {
  intro('nebula drain')

  const ctx = buildCasperOnchainFromEnv()
  if (!ctx.signer || !ctx.pub) {
    cancel('No signer — set CASPER_SECRET_KEY_PATH.')
    return
  }
  const to = opts.to
  if (!to) {
    cancel('Pass --to <hex-public-key>.')
    return
  }

  const before = await getBalanceMotes(ctx.rpc, ctx.pub)
  const gasReserve = csprToMotes(0.5)
  const sendable = before > gasReserve ? before - gasReserve : 0n
  log.info(
    [
      `from       ${ctx.pub.toHex()}`,
      `balance    ${motesToCspr(before)} CSPR`,
      `target     ${to}`,
      `network    ${ctx.network.network}`,
    ].join('\n'),
  )

  if (sendable < csprToMotes(2.5)) {
    log.warn('Below the 2.5 CSPR minimum transfer after the 0.5 CSPR gas reserve.')
    outro('nothing to drain')
    return
  }

  const amountCspr = motesToCspr(sendable)
  if (!opts.yes) {
    const ok = (await confirm({
      message: `Sweep ${amountCspr} CSPR (reserving 0.5 for gas) to ${to}?`,
      initialValue: false,
    })) as boolean | symbol
    if (isCancel(ok) || !ok) {
      cancel('Aborted.')
      return
    }
  }

  const s = spinner()
  s.start(`Sweeping → ${to}`)
  try {
    const { hash, explorer } = await transferCspr(ctx.rpc, ctx.signer, { to, amountCspr })
    const status = await waitForExecution(ctx.rpc, hash)
    if (!status.success) {
      s.stop(`sweep failed: ${status.errorMessage ?? 'unknown'}`)
      return
    }
    s.stop(`swept ${amountCspr} CSPR → ${explorer}`)
    outro(`drained to ${to}`)
  } catch (e) {
    s.stop(`sweep failed: ${(e as Error).message.slice(0, 160)}`)
  }
}
