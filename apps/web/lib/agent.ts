// Server-side nebula agent for the web console. Runs a real OpenAI tool-calling
// loop over live Mantle reads (viem) + a policy-gated MNT send. Self-contained
// (no bun-native package imports) so it runs on a plain Node host.
import 'server-only'

import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  isAddress,
  parseEther,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getReputation, resolveAgent } from '@/lib/chain/erc8004'

const mantle = defineChain({
  id: 5000,
  name: 'Mantle',
  nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mantle.xyz'] } },
})
const pub = createPublicClient({ chain: mantle, transport: http() })
const USDC: Address = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9'

function signer() {
  const pk = process.env.NEBULA_SIGNER_PRIVATE_KEY
  if (!pk) return null
  const account = privateKeyToAccount(pk as `0x${string}`)
  return { account, wallet: createWalletClient({ account, chain: mantle, transport: http() }) }
}

const MAX_NATIVE_MNT = Number(process.env.NEBULA_POLICY_MAX_NATIVE_MNT ?? '2')

// Major Mantle tokens: balances (balanceOf) + DeFiLlama price ids (live USD).
// MNT/WMNT share the native price id.
const TOKENS: { symbol: string; address: Address | 'native'; decimals: number; priceId: string }[] = [
  { symbol: 'MNT', address: 'native', decimals: 18, priceId: 'coingecko:mantle' },
  { symbol: 'WMNT', address: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8', decimals: 18, priceId: 'coingecko:mantle' },
  { symbol: 'USDC', address: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', decimals: 6, priceId: 'mantle:0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9' },
  { symbol: 'USDT', address: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE', decimals: 6, priceId: 'mantle:0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE' },
  { symbol: 'METH', address: '0xcDA86A272531e8640cD7F1a92c01839911B90bb0', decimals: 18, priceId: 'mantle:0xcDA86A272531e8640cD7F1a92c01839911B90bb0' },
  { symbol: 'WETH', address: '0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111', decimals: 18, priceId: 'mantle:0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111' },
]
// symbol → DeFiLlama price id (used by swap_quote).
const PRICE_IDS: Record<string, string> = Object.fromEntries(TOKENS.map(t => [t.symbol, t.priceId]))

async function fetchPrices(ids: string[]): Promise<Record<string, number>> {
  const uniq = Array.from(new Set(ids)).join(',')
  const json = (await fetch(`https://coins.llama.fi/prices/current/${uniq}`)
    .then(r => r.json())
    .catch(() => ({}))) as { coins?: Record<string, { price?: number }> }
  const out: Record<string, number> = {}
  for (const [id, v] of Object.entries(json.coins ?? {})) if (v?.price) out[id] = v.price
  return out
}

// ─── tool specs (OpenAI function-calling) ──
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_balance',
      description: 'Get the MNT (native) and USDC balance of an address on Mantle.',
      parameters: {
        type: 'object',
        properties: { address: { type: 'string', description: '0x address. Defaults to the agent wallet.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gas_price',
      description: 'Current Mantle gas price + the MNT cost of a simple transfer.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'defi_yields',
      description: 'Top Mantle DeFi pools by APY (DeFiLlama), with TVL. Read-only discovery.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'How many pools (default 5).' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'portfolio',
      description:
        "Full token portfolio for an address on Mantle: balances of the major tokens (MNT, WMNT, USDC, USDT, mETH, WETH) with live USD values and a total. Defaults to the user's connected wallet — use this for 'my portfolio / my treasury / my positions'.",
      parameters: {
        type: 'object',
        properties: { address: { type: 'string', description: '0x address. Defaults to the connected wallet.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'swap_quote',
      description:
        'Indicative quote for swapping one Mantle token to another, from live mid-market prices. Read-only — does NOT route through a DEX or execute. Supported symbols: MNT, WMNT, USDC, USDT, METH, WETH.',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', description: 'Token to sell, e.g. "USDC".' },
          toToken: { type: 'string', description: 'Token to buy, e.g. "MNT".' },
          amount: { type: 'string', description: 'Amount of fromToken, e.g. "100".' },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_identity',
      description:
        'Resolve an ERC-8004 agent identity on Mantle (owner, agent address, card) and its reputation (ratings + average score). By agentId.',
      parameters: {
        type: 'object',
        properties: { agentId: { type: 'string', description: 'The ERC-8004 agent id.' } },
        required: ['agentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'simulate_transfer',
      description:
        'Dry-run a native MNT transfer WITHOUT broadcasting: returns the policy verdict (is it within the per-tx cap?) and the estimated gas cost. Use this to preview a send before the owner authorizes the real send_mnt.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: '0x recipient.' },
          amount: { type: 'string', description: 'Amount in MNT, e.g. "0.01".' },
        },
        required: ['to', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_mnt',
      description:
        'Send native MNT to an address. Policy-capped and simulated before broadcast. Requires the owner to be signed in (SIWE).',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: '0x recipient.' },
          amount: { type: 'string', description: 'Amount in MNT, e.g. "0.01".' },
        },
        required: ['to', 'amount'],
      },
    },
  },
] as const

interface ToolContext {
  // The SIWE-connected wallet (null if signed out). Default subject for "my
  // balance / my portfolio / my positions" reads, and the signer for transfers
  // (the user's own wallet signs client-side).
  walletAddress: Address | null
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case 'get_balance': {
      const s = signer()
      const addr = ((args.address as string) || ctx.walletAddress || s?.account.address || '') as Address
      if (!isAddress(addr)) return { error: 'no address — the user is not connected; ask them to connect their wallet (top right).' }
      const [mnt, usdc] = await Promise.all([
        pub.getBalance({ address: addr }),
        pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [addr] }).catch(() => 0n),
      ])
      return { address: addr, MNT: formatEther(mnt), USDC: formatUnits(usdc as bigint, 6) }
    }
    case 'portfolio': {
      const s = signer()
      const addr = ((args.address as string) || ctx.walletAddress || s?.account.address || '') as Address
      if (!isAddress(addr)) return { error: 'no address — the user is not connected; ask them to connect their wallet (top right).' }
      const erc20s = TOKENS.filter(t => t.address !== 'native')
      const [native, ...erc20bals] = await Promise.all([
        pub.getBalance({ address: addr }),
        ...erc20s.map(t =>
          pub
            .readContract({ address: t.address as Address, abi: erc20Abi, functionName: 'balanceOf', args: [addr] })
            .then(v => v as bigint)
            .catch(() => 0n),
        ),
      ])
      const rawBySymbol: Record<string, bigint> = { MNT: native }
      erc20s.forEach((t, i) => {
        rawBySymbol[t.symbol] = erc20bals[i] ?? 0n
      })
      const prices = await fetchPrices(TOKENS.map(t => t.priceId))
      const holdings = TOKENS.map(t => {
        const amount = Number(formatUnits(rawBySymbol[t.symbol] ?? 0n, t.decimals))
        const usd = amount * (prices[t.priceId] ?? 0)
        return { symbol: t.symbol, amount, usd }
      })
        .filter(h => h.amount > 0)
        .sort((a, b) => b.usd - a.usd)
      const totalUsd = holdings.reduce((sum, h) => sum + h.usd, 0)
      return {
        address: addr,
        totalUsd: totalUsd.toFixed(2),
        holdings: holdings.map(h => ({ symbol: h.symbol, amount: h.amount.toPrecision(6), usd: h.usd.toFixed(2) })),
      }
    }
    case 'gas_price': {
      const gp = await pub.getGasPrice()
      const transferCost = (gp * 21000n)
      return { gwei: Number(gp) / 1e9, transferCostMnt: formatEther(transferCost) }
    }
    case 'defi_yields': {
      const limit = Math.min(10, Math.max(1, Number(args.limit ?? 5)))
      const res = await fetch('https://yields.llama.fi/pools')
      const json = (await res.json()) as { data?: { chain: string; project: string; symbol: string; apy: number; tvlUsd: number }[] }
      const pools = (json.data ?? [])
        .filter(p => p.chain === 'Mantle')
        .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
        .slice(0, limit)
        .map(p => ({ project: p.project, symbol: p.symbol, apy: `${(p.apy ?? 0).toFixed(2)}%`, tvlUsd: Math.round(p.tvlUsd) }))
      return { pools }
    }
    case 'swap_quote': {
      const from = String(args.fromToken).toUpperCase().trim()
      const to = String(args.toToken).toUpperCase().trim()
      const amount = Number(args.amount)
      if (!Number.isFinite(amount) || amount <= 0) return { error: 'invalid amount' }
      const idFrom = PRICE_IDS[from]
      const idTo = PRICE_IDS[to]
      if (!idFrom || !idTo) {
        return { error: `unsupported token. supported: ${Object.keys(PRICE_IDS).join(', ')}` }
      }
      const ids = Array.from(new Set([idFrom, idTo])).join(',')
      const res = await fetch(`https://coins.llama.fi/prices/current/${ids}`)
      const json = (await res.json()) as { coins?: Record<string, { price?: number }> }
      const priceFrom = json.coins?.[idFrom]?.price
      const priceTo = json.coins?.[idTo]?.price
      if (!priceFrom || !priceTo) return { error: 'price unavailable for one of the tokens right now' }
      const out = (amount * priceFrom) / priceTo
      return {
        from,
        to,
        amountIn: String(amount),
        indicativeAmountOut: out.toPrecision(8),
        priceUsd: { [from]: priceFrom, [to]: priceTo },
        executed: false,
        note: 'Indicative mid-market quote from live prices. Excludes DEX fees, slippage and routing — not a routed quote and not executed.',
      }
    }
    case 'agent_identity': {
      const id = BigInt(String(args.agentId))
      const [info, rep] = await Promise.all([
        resolveAgent(pub, 5000, id),
        getReputation(pub, 5000, id).catch(() => null),
      ])
      return {
        agentId: id.toString(),
        owner: info.owner,
        agentAddress: info.agentAddress,
        name: info.card?.name ?? null,
        description: info.card?.description ?? null,
        reputation: rep ? { ratings: rep.count.toString(), averageScore: rep.averageScore.toString() } : null,
      }
    }
    case 'simulate_transfer': {
      const to = String(args.to) as Address
      if (!isAddress(to)) return { error: 'invalid recipient' }
      const amount = String(args.amount)
      const num = Number(amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      const gp = await pub.getGasPrice()
      // A native MNT transfer is a fixed 21000 gas; deterministic, no funded sender needed.
      const gasMnt = formatEther(21000n * gp)
      return {
        to,
        amount,
        withinPolicyCap: num <= MAX_NATIVE_MNT,
        policyCapMnt: MAX_NATIVE_MNT,
        estimatedGasMnt: gasMnt,
        broadcast: false,
        note: 'simulation only — no transaction was sent',
      }
    }
    case 'send_mnt': {
      // The user's own connected wallet signs and broadcasts — the server never
      // holds a key. We validate, enforce the policy cap, and simulate, then
      // return a prepared action that the UI confirms in the wallet.
      const to = String(args.to) as Address
      if (!isAddress(to)) return { error: 'invalid recipient' }
      const amount = String(args.amount)
      const num = Number(amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      if (!ctx.walletAddress) {
        return { error: 'no connected wallet — ask the user to connect their wallet (top-right) to sign the transfer.' }
      }
      if (num > MAX_NATIVE_MNT) {
        return { error: `policy blocked: ${amount} MNT exceeds the ${MAX_NATIVE_MNT} MNT per-tx cap` }
      }
      const value = parseEther(amount)
      const gp = await pub.getGasPrice()
      return {
        proposed: true,
        kind: 'transfer',
        from: ctx.walletAddress,
        to,
        amount,
        valueWei: value.toString(),
        withinPolicyCap: true,
        policyCapMnt: MAX_NATIVE_MNT,
        estimatedGasMnt: formatEther(21000n * gp),
        note: 'Prepared and policy-checked. A "Confirm in wallet" button is shown to the user — their connected wallet signs and broadcasts it. Tell them to confirm in their wallet; do not claim it is already sent.',
      }
    }
    default:
      return { error: `unknown tool ${name}` }
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
}

/** A transfer prepared server-side (validated, policy-capped, simulated) for the
 *  user's connected wallet to sign + broadcast client-side. */
export interface PendingAction {
  kind: 'transfer'
  from: string
  to: string
  amount: string
  valueWei: string
  estimatedGasMnt?: string
}

export interface AgentResult {
  reply: string
  trace: { tool: string; args: unknown; result: unknown }[]
  pendingAction?: PendingAction
}

const SYSTEM_PROMPT = `You are nebula, a Mantle-native, policy-aware AI treasury assistant.
You operate on Mantle (chain 5000). Use the tools to answer with live on-chain data — never invent numbers.
The defensible idea: the AI advises, deterministic code enforces the fund controls. Value-moving actions
are policy-capped and simulated before they can broadcast; say so when you use them.
Transfers execute from the user's OWN connected wallet: send_mnt prepares and policy-checks the transfer and
the UI shows a "Confirm in wallet" button — the user's wallet signs and broadcasts. Never claim a transfer
was already sent; say it's prepared and ask them to confirm in their wallet. If no wallet is connected, tell
them to connect (top-right).
Swaps are quote-only here: swap_quote returns an indicative mid-market estimate, not a routed/executed
swap. Never claim a swap was executed — present it as an estimate and say execution isn't enabled yet.
Be concise and concrete. When you cite a balance, yield, quote, or tx, it must come from a tool result.`

const OPENAI_URL = (process.env.NEBULA_LLM_BASE_URL ?? 'https://api.openai.com/v1') + '/chat/completions'
const MODEL = process.env.NEBULA_LLM_MODEL ?? 'gpt-4o-mini'

export interface RunAgentOptions {
  /** SIWE-authenticated wallet address for this request, if any. */
  authedAddress?: string | null
}

function extractPendingAction(trace: AgentResult['trace']): PendingAction | undefined {
  // Last prepared transfer wins (the one the user is being asked to confirm).
  for (let i = trace.length - 1; i >= 0; i--) {
    const r = trace[i].result as Record<string, unknown> | null
    if (r && r.proposed === true && r.kind === 'transfer' && typeof r.valueWei === 'string') {
      return {
        kind: 'transfer',
        from: String(r.from ?? ''),
        to: String(r.to ?? ''),
        amount: String(r.amount ?? ''),
        valueWei: String(r.valueWei),
        estimatedGasMnt: r.estimatedGasMnt ? String(r.estimatedGasMnt) : undefined,
      }
    }
  }
  return undefined
}

export async function runAgent(history: ChatMessage[], opts: RunAgentOptions = {}): Promise<AgentResult> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEBULA_LLM_API_KEY
  if (!apiKey) return { reply: 'The agent brain is not configured (no OPENAI_API_KEY on the server).', trace: [] }

  const walletAddress =
    opts.authedAddress && isAddress(opts.authedAddress) ? (opts.authedAddress as Address) : null
  const ctx: ToolContext = { walletAddress }

  const sys = walletAddress
    ? `${SYSTEM_PROMPT}\nThe user's connected wallet is ${walletAddress}. When they say "my", "me", "my treasury", "my balance/portfolio/positions", treat that as this address — call the tool with no address (it defaults to the connected wallet) and never ask them to paste an address.`
    : `${SYSTEM_PROMPT}\nThe user is not signed in, so there is no connected wallet. If they ask about "my" balance/portfolio, ask them to connect their wallet (top-right) — or answer for a specific address if they give one.`

  const messages: ChatMessage[] = [{ role: 'system', content: sys }, ...history]
  const trace: AgentResult['trace'] = []

  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.3 }),
    })
    if (!res.ok) return { reply: `brain error: ${res.status} ${(await res.text()).slice(0, 160)}`, trace }
    const data = (await res.json()) as {
      choices: { message: ChatMessage & { tool_calls?: ChatMessage['tool_calls'] } }[]
    }
    const msg = data.choices?.[0]?.message
    if (!msg) return { reply: 'no response from brain', trace }
    messages.push(msg)

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { reply: msg.content || '(no reply)', trace, pendingAction: extractPendingAction(trace) }
    }

    for (const call of msg.tool_calls) {
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(call.function.arguments || '{}')
      } catch {}
      let result: unknown
      try {
        result = await runTool(call.function.name, parsed, ctx)
      } catch (e) {
        result = { error: (e as Error).message }
      }
      trace.push({ tool: call.function.name, args: parsed, result })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
  return { reply: 'Stopped after several tool calls without a final answer — try rephrasing.', trace }
}
