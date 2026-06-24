import { motesToCspr } from 'nebula-ai-plugin-onchain'

/** Casper spot price used for USD estimates. Not authoritative, just a hint. */
const CSPR_USD = 0.02

export type DeployTarget = 'local'

export interface CostBreakdown {
  agentFloat: bigint
  totalOperator: bigint
  deployTarget: DeployTarget
}

export function estimateCosts(opts?: {
  ledgerSizeOg?: number
  withSubname?: boolean
  deployTarget?: DeployTarget
  /** Agent gas float, in motes (1 CSPR = 1e9 motes). */
  agentFloatMotes?: bigint
}): CostBreakdown {
  // The only init cost is funding the agent account with a small CSPR float.
  // There is no identity mint, no storage anchor, and no compute ledger.
  const agentFloat = opts?.agentFloatMotes ?? 5_000_000_000n // 5 CSPR
  return { agentFloat, totalOperator: agentFloat, deployTarget: opts?.deployTarget ?? 'local' }
}

export function formatUsd(valueMotes: bigint): string {
  const cspr = motesToCspr(valueMotes)
  return `$${(cspr * CSPR_USD).toFixed(2)}`
}

export function renderCostSummary(c: CostBreakdown): string {
  const line = (label: string, motes: bigint): string =>
    `    ${label.padEnd(32)}${String(motesToCspr(motes)).padStart(8)} CSPR  (${formatUsd(motes)})`
  return [
    '  operator spend (Casper):',
    line('agent infra float (gas)', c.agentFloat),
    `    ${'─'.repeat(32)}${'─'.repeat(18)}`,
    line('total operator spend', c.totalOperator),
  ].join('\n')
}
