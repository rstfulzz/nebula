/**
 * 4 hero cycles. Each cycle has:
 * - surface: TUI vs TG (drives chat aesthetic)
 * - prompt: the natural-language operator prompt
 * - tool stream: ordered list of tool calls + their result indicators
 * - reply: bot's final reply
 * - artifact: the output canvas card type
 * - painting: which Aurelia wash for the canvas backdrop
 * - greeting (TG only): optional warmup turn before the main exchange
 */

export type CycleSurface = 'tui' | 'tg'
export type ToolStreamEntry = { tool: string; args?: string; status: 'ok' | 'failed' }

export type ResearchCard = {
  type: 'research'
  title: string
  sources: Array<{ name: string; url: string; preview: string }>
}
export type SwapCard = {
  type: 'swap'
  fromAmount: string
  fromSymbol: string
  toAmount: string
  toSymbol: string
  txHash: string
  newBalance: string
}
export type AuditCard = {
  type: 'audit'
  jobId: string
  agent: string
  bidAmount: string
  status: string
  reportHash: string
  txHash: string
}
export type StakeCard = {
  type: 'stake'
  position: string
  validator: string
  apr: string
  unlockBlock: number
  txHash: string
}

export type CycleArtifact = ResearchCard | SwapCard | AuditCard | StakeCard

export type CycleGreeting = { prompt: string; reply: string }

export type Cycle = {
  id: string
  surface: CycleSurface
  greeting?: CycleGreeting
  prompt: string
  toolStream: ToolStreamEntry[]
  reply: string
  artifact: CycleArtifact
  painting: '1' | '2' | '3' | '4'
  durationMs: number
}

export const CYCLES: Cycle[] = [
  // ─── Cycle 1 , TUI · deep research on Mantle chain ───────────────────────
  {
    id: 'research',
    surface: 'tui',
    prompt:
      'find the best stablecoin yield on Mantle and flag anything restricted',
    toolStream: [
      { tool: 'defi.yields', args: 'Mantle · stablecoin', status: 'ok' },
      { tool: 'tokens.info', args: 'top pools', status: 'ok' },
      { tool: 'web.fetch', args: 'defillama.com/chain/mantle', status: 'ok' },
      { tool: 'chain.contract', args: 'pool introspection', status: 'ok' },
      { tool: 'memory.save', args: 'yield scan', status: 'ok' },
    ],
    reply: `Pulled Mantle stablecoin pools from DeFiLlama (discovery only, no execution):

**Aave V3 · USDC** , supply APY ~4.1%, deep liquidity, blue-chip risk. Reachable via aave.supply.

**Agni Finance · USDC/USDT** , LP APY ~6.8%, higher variance, impermanent-loss exposure.

**Restricted (RWA)** , USDY, MI4, and mUSD show attractive headline yields but are flagged: eligibility-gated products. I will not propose entering these without explicit confirmation that you qualify.

Recommendation: Aave V3 USDC for a low-risk allocation. Say the word and I will run it through policy, simulate it, and ask for approval before anything moves.`,
    artifact: {
      type: 'research',
      title: 'Mantle yields · field report',
      sources: [
        { name: 'defillama.com', url: 'https://defillama.com', preview: 'Mantle pools · APY / TVL' },
        { name: 'aave.com', url: 'https://aave.com', preview: 'Aave V3 · USDC supply' },
        { name: 'agni.finance', url: 'https://agni.finance', preview: 'USDC/USDT LP' },
        { name: 'mantlescan.xyz', url: 'https://mantlescan.xyz', preview: 'mainnet 5000 · MNT' },
        { name: 'RWA flags', url: 'https://defillama.com', preview: 'USDY · MI4 · mUSD restricted' },
      ],
    },
    painting: '1',
    durationMs: 12000,
  },

  // ─── Cycle 2 , TG · greeting + swap ──────────────────────────────────
  {
    id: 'swap',
    surface: 'tg',
    greeting: {
      prompt: 'gm',
      reply: 'gm ☀️',
    },
    prompt: 'swap 5 MNT for USDC on Agni',
    toolStream: [
      { tool: 'chain.balance', args: 'MNT', status: 'ok' },
      { tool: 'swap.quote', args: '5 MNT → USDC', status: 'ok' },
      { tool: 'swap.execute', args: 'route: MNT/WMNT/USDC', status: 'ok' },
      { tool: 'chain.tx', args: '0xa12c…1129', status: 'ok' },
      { tool: 'memory.save', args: 'swap record', status: 'ok' },
    ],
    reply: `Cleared the gates, then settled.

policy: in-cap · simulate: would succeed · approval: auto (in tier)

**5.000 MNT → 4.93 USDC** received.
Route: MNT → WMNT → USDC via Agni (0.05% tier)
Slippage 0.42% · within the 1% cap

Pre-swap: 12.563 USDC
Post-swap: **17.493 USDC**

Tx: mantlescan.xyz/0xa12c…1129`,
    artifact: {
      type: 'swap',
      fromAmount: '5.000',
      fromSymbol: 'MNT',
      toAmount: '4.93',
      toSymbol: 'USDC',
      txHash: '0xa12c7e9118db44dd8a2e34c10f4bc11129',
      newBalance: '17.493 USDC',
    },
    painting: '2',
    // last provenance station fires at 7500ms (s-anchor) + ~3000ms outcome hold
    durationMs: 10500,
  },

  // ─── Cycle 3 , TUI · approval floor ───────────────────────────────────
  {
    id: 'commerce',
    surface: 'tui',
    prompt:
      'supply 25,000 USDC to Aave',
    toolStream: [
      { tool: 'aave.position', args: 'current', status: 'ok' },
      { tool: 'defi.yields', args: 'aave usdc', status: 'ok' },
      { tool: 'aave.supply', args: '25,000 USDC', status: 'ok' },
      { tool: 'chain.tx', args: '0x3ebd…772a', status: 'ok' },
      { tool: 'memory.save', args: 'supply record', status: 'ok' },
    ],
    reply: `This one needs you.

**policy** , in-cap, recipient and token allowlisted: pass.
**simulate** , aave.supply would succeed, est. gas 168,402.
**approval** , 25,000 USDC crosses the material-risk threshold. The approval floor sits beneath the session mode, so I am holding it for you even though autonomy is set to auto.

Approve to supply, or deny to abort. Nothing has been broadcast yet.

[ approved ]

Supplied **25,000 USDC** to Aave V3 · supply APY ~4.1%.
Health factor: n/a (supply only) · earning from this block.
Tx: mantlescan.xyz/0x3ebd…772a`,
    artifact: {
      type: 'audit',
      jobId: '0x3ebd9f5cc2118c3ad33c3d50918e2772a',
      agent: 'aave.supply',
      bidAmount: '25,000 USDC',
      status: 'approved',
      reportHash: '0xb7ce1142e43d17a92c94a8f0',
      txHash: '0x3ebd9f5cc2118c3ad33c3d50918e2772a',
    },
    painting: '3',
    // last provenance station fires at 6700ms (c-storage) + ~3000ms outcome hold
    durationMs: 10500,
  },

  // ─── Cycle 4 , TG · greeting + Aave position ─────────────────────────
  {
    id: 'stake',
    surface: 'tg',
    greeting: {
      prompt: 'hi there',
      reply: 'hi 👋 ready when you are',
    },
    prompt: 'how is my Aave position, and withdraw 2,000 USDC',
    toolStream: [
      { tool: 'aave.position', args: 'current', status: 'ok' },
      { tool: 'aave.withdraw', args: '2,000 USDC', status: 'ok' },
      { tool: 'chain.tx', args: '0x771a…c8e0', status: 'ok' },
      { tool: 'memory.save', args: 'position record', status: 'ok' },
    ],
    reply: `Checked, then withdrew (in-cap, simulated, auto-approved).

Aave V3 position before:
- Supplied: 27,000 USDC · supply APY ~4.1%
- No borrows · health factor: n/a

**Withdrew 2,000 USDC** back to your wallet.

Position now:
- Supplied: **25,000 USDC**
- Still earning ~4.1% APY

Tx: mantlescan.xyz/0x771a…c8e0`,
    artifact: {
      type: 'stake',
      position: '25,000 USDC',
      validator: 'Aave V3',
      apr: '4.1%',
      unlockBlock: 4_381_201,
      txHash: '0x771a8e44c0d3294411fefc7b87c8e0',
    },
    painting: '4',
    // last provenance station fires at 7000ms (st-anchor) + ~3000ms outcome hold
    durationMs: 10000,
  },
]
