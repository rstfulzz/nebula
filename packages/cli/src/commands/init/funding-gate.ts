import { cancel, isCancel, select } from '@clack/prompts'
import { PublicKey, type RpcClient } from 'casper-js-sdk'
import { getBalanceMotes, motesToCspr } from 'nebula-ai-plugin-onchain'
import qrcode from 'qrcode-terminal'

export interface FundingGateOpts {
  rpc: RpcClient
  /** Operator public key hex (`01…`/`02…`). */
  operatorPublicKeyHex: string
  /** Required balance, in motes (1 CSPR = 1e9 motes). */
  requiredMotes: bigint
  pollIntervalMs?: number
  maxWaitMs?: number
}

export type FundingGateOutcome =
  | { kind: 'funded'; balance: bigint }
  | { kind: 'skip-ledger' }
  | { kind: 'cancel' }

/**
 * Show the operator public key as a QR and poll its CSPR balance until it meets
 * the required threshold. The user can cancel or proceed with minimum-only at
 * any point.
 *
 * Console prints the QR once; the polling loop updates a single line using
 * `process.stdout.write` so the display doesn't scroll.
 */
export async function fundingGate(opts: FundingGateOpts): Promise<FundingGateOutcome> {
  const pollIntervalMs = opts.pollIntervalMs ?? 10_000
  const maxWaitMs = opts.maxWaitMs ?? 30 * 60_000 // 30 minutes
  const pub = PublicKey.fromHex(opts.operatorPublicKeyHex)

  console.log('')
  console.log(`  Send at least ${motesToCspr(opts.requiredMotes)} CSPR to:`)
  console.log(`    ${opts.operatorPublicKeyHex}`)
  console.log('')
  qrcode.generate(opts.operatorPublicKeyHex, { small: true })
  console.log('')

  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const balance = await getBalanceMotes(opts.rpc, pub).catch(() => 0n)
    if (balance >= opts.requiredMotes) {
      process.stdout.write('\r')
      return { kind: 'funded', balance }
    }
    process.stdout.write(
      `\r  polling... current balance ${motesToCspr(balance)} CSPR (need ${motesToCspr(opts.requiredMotes)}) `,
    )
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }

  process.stdout.write('\n\n')
  const choice = await select({
    message: 'Balance still insufficient. What now?',
    options: [
      { value: 'skip' as const, label: 'Skip funding for now' },
      { value: 'cancel' as const, label: 'Cancel init' },
    ],
    initialValue: 'cancel',
  })
  if (isCancel(choice)) {
    cancel('Aborted.')
    return { kind: 'cancel' }
  }
  return choice === 'skip' ? { kind: 'skip-ledger' } : { kind: 'cancel' }
}
