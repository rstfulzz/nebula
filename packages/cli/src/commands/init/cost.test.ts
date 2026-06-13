import { describe, expect, it } from 'bun:test'
import { parseEther } from 'viem'
import {
  SANDBOX_BURN_RATE_OG_PER_HOUR,
  SANDBOX_DEFAULT_INITIAL_DEPOSIT_OG,
  estimateCosts,
  renderCostSummary,
} from './cost'

describe('estimateCosts', () => {
  it('local target: zero sandbox fields', () => {
    const c = estimateCosts({ ledgerSizeOg: 3, withSubname: true, deployTarget: 'local' })
    expect(c.sandboxInitialDepositTestnet).toBe(0n)
    expect(c.sandboxBurnRatePerHourTestnet).toBe(0n)
    expect(c.deployTarget).toBe('local')
    expect(c.totalOperator).toBe(parseEther('3.115'))
  })

  it('sandbox target: populates testnet fields', () => {
    const c = estimateCosts({ ledgerSizeOg: 3, withSubname: true, deployTarget: 'sandbox' })
    expect(c.sandboxInitialDepositTestnet).toBe(
      parseEther(String(SANDBOX_DEFAULT_INITIAL_DEPOSIT_OG)),
    )
    expect(c.sandboxBurnRatePerHourTestnet).toBe(parseEther(String(SANDBOX_BURN_RATE_OG_PER_HOUR)))
    expect(c.deployTarget).toBe('sandbox')
    // mainnet totalOperator UNCHANGED by deploy target (testnet is a separate pool)
    expect(c.totalOperator).toBe(parseEther('3.115'))
  })

  it('burn rate equals topup.ts canonical 0.09 Mantle/hour', () => {
    expect(SANDBOX_BURN_RATE_OG_PER_HOUR).toBe(0.09)
    const c = estimateCosts({ ledgerSizeOg: 3, withSubname: false, deployTarget: 'sandbox' })
    expect(c.sandboxBurnRatePerHourTestnet).toBe(parseEther('0.09'))
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

  it('sandbox target: includes Sepolia testnet section with runway + faucet', () => {
    const c = estimateCosts({ ledgerSizeOg: 3, withSubname: true, deployTarget: 'sandbox' })
    const out = renderCostSummary(c)
    expect(out).toContain('sandbox spend (Sepolia testnet Mantle, free via faucet):')
    expect(out).toContain('initial provider deposit')
    expect(out).toContain('runtime burn')
    expect(out).toContain('1 Mantle')
    expect(out).toContain('0.09 Mantle/h')
    expect(out).toContain('faucet.mantle.xyz')
    expect(out).toContain('auto-topup')
    expect(out).toContain('runway')
  })

  it('sandbox target: runway expressed in hours for ~1 Mantle default', () => {
    const c = estimateCosts({ ledgerSizeOg: 3, withSubname: false, deployTarget: 'sandbox' })
    const out = renderCostSummary(c)
    // 1 Mantle / 0.09 Mantle/h = 11.11h
    expect(out).toMatch(/~11\.[0-9]h runway/)
  })

  it('still shows USD $0.00 for testnet line', () => {
    const c = estimateCosts({ ledgerSizeOg: 3, withSubname: false, deployTarget: 'sandbox' })
    const out = renderCostSummary(c)
    // Testnet Mantle is free — USD col should read ($0.00)
    expect(out).toMatch(/initial provider deposit\s+1 Mantle\s+\(\$0\.00\)/)
    expect(out).not.toMatch(/initial provider deposit\s+1 Mantle\s+\(\$0\.50\)/)
  })
})
