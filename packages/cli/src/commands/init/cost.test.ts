import { describe, expect, it } from 'bun:test'
import { csprToMotes } from 'nebula-ai-plugin-onchain'
import { estimateCosts, renderCostSummary } from './cost'

describe('estimateCosts', () => {
  it('local target: agent gas float only (no mint/ledger/storage)', () => {
    const c = estimateCosts({ deployTarget: 'local' })
    expect(c.deployTarget).toBe('local')
    expect(c.agentFloat).toBe(csprToMotes(5))
    expect(c.totalOperator).toBe(csprToMotes(5))
  })
})

describe('renderCostSummary', () => {
  it('shows only the agent gas float; no extra cost lines', () => {
    const out = renderCostSummary(estimateCosts({ deployTarget: 'local' }))
    expect(out).toContain('operator spend (Casper)')
    expect(out).toContain('agent infra float (gas)')
    expect(out).not.toContain('mint')
    expect(out).not.toContain('compute ledger deposit')
    expect(out).not.toContain('storage upload')
    expect(out).not.toContain('subname')
  })
})
