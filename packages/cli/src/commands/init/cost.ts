import { formatEther } from 'viem'

/** Mantle mainnet spot price used for USD estimates. Not authoritative, just a hint. */
const OG_USD = 0.5

export type DeployTarget = 'local'

export interface CostBreakdown {
  mintAndApproveGas: bigint
  agentFloat: bigint
  computeLedgerDeposit: bigint
  storageUploadGas: bigint
  subnameAndRecords: bigint
  totalOperator: bigint
  deployTarget: DeployTarget
}

export function estimateCosts(opts: {
  ledgerSizeOg: number
  withSubname: boolean
  deployTarget: DeployTarget
}): CostBreakdown {
  const mintAndApproveGas = 10_000_000_000_000_000n // ~0.01 Mantle (mint + setApprovalForAll bundle)
  const agentFloat = 100_000_000_000_000_000n // 0.1 Mantle — infra float for the agent
  const computeLedgerDeposit = BigInt(Math.round(opts.ledgerSizeOg * 1e18))
  const storageUploadGas = 5_000_000_000_000_000n // ~0.005 Mantle (storage anchor tx)
  const subnameAndRecords = opts.withSubname
    ? 30_000_000_000_000_000n // ~0.03 Mantle (claim + 2 text records, paid from agent float)
    : 0n
  const totalOperator = mintAndApproveGas + agentFloat + computeLedgerDeposit + storageUploadGas
  return {
    mintAndApproveGas,
    agentFloat,
    computeLedgerDeposit,
    storageUploadGas,
    subnameAndRecords,
    totalOperator,
    deployTarget: opts.deployTarget,
  }
}

export function formatUsd(valueWei: bigint): string {
  const og = Number(formatEther(valueWei))
  return `$${(og * OG_USD).toFixed(2)}`
}

export function renderCostSummary(c: CostBreakdown): string {
  const line = (label: string, wei: bigint): string =>
    `    ${label.padEnd(32)}${formatEther(wei).padStart(8)} Mantle  (${formatUsd(wei)})`
  const lines = [
    '  operator spend (Mantle mainnet):',
    line('mint + setApprovalForAll', c.mintAndApproveGas),
    line('storage upload (keystore)', c.storageUploadGas),
    line('agent infra float', c.agentFloat),
    line('compute ledger deposit', c.computeLedgerDeposit),
    `    ${'─'.repeat(32)}${'─'.repeat(18)}`,
    line('total operator spend', c.totalOperator),
    '',
    '  agent spend (from the float):',
    line('subname + text records', c.subnameAndRecords),
  ]
  return lines.join('\n')
}
