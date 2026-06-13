import { describe, expect, it } from 'bun:test'
import { parseEther } from 'viem'
import { estimateCosts, renderCostSummary } from './cost'

describe('estimateCosts', () => {
  it('local target: operator spend only', () => {
    const c = estimateCosts({ ledgerSizeOg: 3, withSubname: true, deployTarget: 'local' })
    expect(c.deployTarget).toBe('local')
    expect(c.totalOperator).toBe(parseEther('3.115'))
  })
})

describe('renderCostSummary', () => {
  it('local target: omits sandbox section', () => {
    const c = estimateCosts({ ledgerSizeOg: 3, withSubname: true, deployTarget: 'local' })
    const out = renderCostSummary(c)
    expect(out).toContain('operator spend (Mantle mainnet)')
    expect(out).toContain('mint + setApprovalForAll')
    expect(out).toContain('compute ledger deposit')
    expect(out).not.toContain('sandbox spend')
    expect(out).not.toContain('Sepolia testnet')
    expect(out).not.toContain('faucet')
  })
})
