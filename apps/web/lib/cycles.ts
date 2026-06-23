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
  // ─── Cycle 1 , TUI · deep research on Casper chain ───────────────────────
  {
    id: 'research',
    surface: 'tui',
    prompt:
      'find the best stablecoin yield on Casper and flag anything restricted',
    toolStream: [
      { tool: 'defi.yields', args: 'Casper · stablecoin', status: 'ok' },
      { tool: 'tokens.info', args: 'top pools', status: 'ok' },
      { tool: 'web.fetch', args: 'defillama.com/chain/casper', status: 'ok' },
      { tool: 'chain.contract', args: 'pool introspection', status: 'ok' },
      { tool: 'memory.save', args: 'yield scan', status: 'ok' },
    ],
    reply: `Pulled Casper stablecoin pools from DeFiLlama (discovery only, no execution):

**Native staking · CSPR** , staking APY ~4.1%, deep liquidity, blue-chip risk. Reachable via stake.delegate.

**Friendly Market · USDC/USDT** , LP APY ~6.8%, higher variance, impermanent-loss exposure.

**Restricted (RWA)** , USDY, MI4, and mUSD show attractive headline yields but are flagged: eligibility-gated products. I will not propose entering these without explicit confirmation that you qualify.

Recommendation: native CSPR staking for a low-risk allocation. Say the word and I will run it through policy, simulate it, and ask for approval before anything moves.`,
    artifact: {
      type: 'research',
      title: 'Casper yields · field report',
      sources: [
        { name: 'defillama.com', url: 'https://defillama.com', preview: 'Casper pools · APY / TVL' },
        { name: 'cspr.live', url: 'https://cspr.live', preview: 'native staking · CSPR' },
        { name: 'friendly.market', url: 'https://friendly.market', preview: 'USDC/USDT LP' },
        { name: 'testnet.cspr.live', url: 'https://testnet.cspr.live', preview: 'testnet · CSPR' },
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
    prompt: 'swap 5 CSPR for USDC on Friendly Market',
    toolStream: [
      { tool: 'chain.balance', args: 'CSPR', status: 'ok' },
      { tool: 'swap.quote', args: '5 CSPR → USDC', status: 'ok' },
      { tool: 'swap.execute', args: 'route: CSPR/WCSPR/USDC', status: 'ok' },
      { tool: 'chain.tx', args: '0202…1129', status: 'ok' },
      { tool: 'memory.save', args: 'swap record', status: 'ok' },
    ],
    reply: `Cleared the gates, then settled.

policy: in-cap · simulate: would succeed · approval: auto (in tier)

**5.000 CSPR → 4.93 USDC** received.
Route: CSPR → WCSPR → USDC via Friendly Market (0.05% tier)
Slippage 0.42% · within the 1% cap

Pre-swap: 12.563 USDC
Post-swap: **17.493 USDC**

Tx: testnet.cspr.live/0202…1129`,
    artifact: {
      type: 'swap',
      fromAmount: '5.000',
      fromSymbol: 'CSPR',
      toAmount: '4.93',
      toSymbol: 'USDC',
      txHash: '0202a12c7e9118db44dd8a2e34c10f4bc11129',
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
      'stake 25,000 CSPR with a validator',
    toolStream: [
      { tool: 'stake.position', args: 'current', status: 'ok' },
      { tool: 'defi.yields', args: 'staking cspr', status: 'ok' },
      { tool: 'stake.delegate', args: '25,000 CSPR', status: 'ok' },
      { tool: 'chain.tx', args: '0202…772a', status: 'ok' },
      { tool: 'memory.save', args: 'stake record', status: 'ok' },
    ],
    reply: `This one needs you.

**policy** , in-cap, recipient and token allowlisted: pass.
**simulate** , stake.delegate would succeed, est. gas 168,402.
**approval** , 25,000 CSPR crosses the material-risk threshold. The approval floor sits beneath the session mode, so I am holding it for you even though autonomy is set to auto.

Approve to stake, or deny to abort. Nothing has been broadcast yet.

[ approved ]

Delegated **25,000 CSPR** to a validator · staking APY ~4.1%.
Health factor: n/a (delegation only) · earning from this era.
Tx: testnet.cspr.live/0202…772a`,
    artifact: {
      type: 'audit',
      jobId: '0202_3ebd9f5cc2118c3ad33c3d50918e2772a',
      agent: 'stake.delegate',
      bidAmount: '25,000 CSPR',
      status: 'approved',
      reportHash: '0202b7ce1142e43d17a92c94a8f0',
      txHash: '0202_3ebd9f5cc2118c3ad33c3d50918e2772a',
    },
    painting: '3',
    // last provenance station fires at 6700ms (c-storage) + ~3000ms outcome hold
    durationMs: 10500,
  },

  // ─── Cycle 4 , TG · greeting + staking position ─────────────────────────
  {
    id: 'stake',
    surface: 'tg',
    greeting: {
      prompt: 'hi there',
      reply: 'hi 👋 ready when you are',
    },
    prompt: 'how is my staking position, and undelegate 2,000 CSPR',
    toolStream: [
      { tool: 'stake.position', args: 'current', status: 'ok' },
      { tool: 'stake.undelegate', args: '2,000 CSPR', status: 'ok' },
      { tool: 'chain.tx', args: '0202…c8e0', status: 'ok' },
      { tool: 'memory.save', args: 'position record', status: 'ok' },
    ],
    reply: `Checked, then undelegated (in-cap, simulated, auto-approved).

Staking position before:
- Delegated: 27,000 CSPR · staking APY ~4.1%
- No borrows · health factor: n/a

**Undelegated 2,000 CSPR** back to your wallet.

Position now:
- Delegated: **25,000 CSPR**
- Still earning ~4.1% APY

Tx: testnet.cspr.live/0202…c8e0`,
    artifact: {
      type: 'stake',
      position: '25,000 CSPR',
      validator: 'Casper staking',
      apr: '4.1%',
      unlockBlock: 4_381_201,
      txHash: '0202771a8e44c0d3294411fefc7b87c8e0',
    },
    painting: '4',
    // last provenance station fires at 7000ms (st-anchor) + ~3000ms outcome hold
    durationMs: 10000,
  },
]
