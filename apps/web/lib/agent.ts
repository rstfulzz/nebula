// Server-side nebula agent for the web console. Runs a real OpenAI tool-calling
// loop over live Mantle reads (viem) + a policy-gated MNT send. Self-contained
// (no bun-native package imports) so it runs on a plain Node host.
import 'server-only'

import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  isAddress,
  parseEther,
  parseUnits,
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
const WMNT: Address = '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8'
const WETH9_ABI = [
  { type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'wad', type: 'uint256' }],
    outputs: [],
  },
] as const

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

// Native MNT sentinel used by DEX aggregators.
const NATIVE_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
// symbol → {address, decimals} for swap execution (MNT = native sentinel).
const SWAP_TOKENS: Record<string, { address: string; decimals: number }> = {
  MNT: { address: NATIVE_SENTINEL, decimals: 18 },
  WMNT: { address: WMNT, decimals: 18 },
  USDC: { address: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', decimals: 6 },
  USDT: { address: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE', decimals: 6 },
  METH: { address: '0xcDA86A272531e8640cD7F1a92c01839911B90bb0', decimals: 18 },
  WETH: { address: '0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111', decimals: 18 },
}

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
      name: 'swap_execute',
      description:
        "Prepare a REAL token swap on Mantle for the user to confirm in their wallet. Routed across Mantle DEXes (Merchant Moe, Agni, …) via the OpenOcean aggregator for the best price, with slippage protection. Use this whenever the user wants to actually swap / trade / exchange tokens (not just a price quote). Supported: MNT, WMNT, USDC, USDT, METH, WETH. The user's connected wallet signs; ERC-20 inputs may need a one-time approve first.",
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', description: 'Token to sell, e.g. "MNT".' },
          toToken: { type: 'string', description: 'Token to buy, e.g. "USDC".' },
          amount: { type: 'string', description: 'Amount of fromToken, e.g. "0.01".' },
          slippagePct: { type: 'number', description: 'Max slippage in percent (default 1).' },
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
      name: 'send_mnt',
      description:
        'Prepare a native MNT transfer for the user to confirm in their wallet. ALWAYS use this when the user wants to send / transfer / pay MNT to an address. It validates, enforces the policy cap, and simulates gas, then a "Confirm in wallet" button is shown and the user\'s own connected wallet signs and broadcasts. This is how transfers are executed — there is no separate simulate step.',
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
      name: 'send_token',
      description:
        "Prepare an ERC-20 token transfer for the user to confirm in their wallet. Use when the user wants to send/transfer a token (not native MNT). Supported: USDC, USDT, WMNT, METH, WETH. The user's connected wallet signs.",
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Token symbol, e.g. "USDC".' },
          to: { type: 'string', description: '0x recipient.' },
          amount: { type: 'string', description: 'Amount in token units, e.g. "5".' },
        },
        required: ['token', 'to', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wrap_mnt',
      description:
        "Prepare a wrap of native MNT into WMNT (ERC-20) for the user to confirm in their wallet. Calls WMNT.deposit() with the amount as value. Use when the user wants to wrap MNT.",
      parameters: {
        type: 'object',
        properties: { amount: { type: 'string', description: 'Amount of MNT to wrap, e.g. "0.1".' } },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unwrap_mnt',
      description:
        'Prepare an unwrap of WMNT back into native MNT for the user to confirm in their wallet. Calls WMNT.withdraw(amount). Use when the user wants to unwrap WMNT.',
      parameters: {
        type: 'object',
        properties: { amount: { type: 'string', description: 'Amount of WMNT to unwrap, e.g. "0.1".' } },
        required: ['amount'],
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
    case 'swap_execute': {
      if (!ctx.walletAddress) {
        return { error: 'no connected wallet — ask the user to connect their wallet (top-right) to swap.' }
      }
      const fromSym = String(args.fromToken).toUpperCase().trim()
      const toSym = String(args.toToken).toUpperCase().trim()
      const fromTok = SWAP_TOKENS[fromSym]
      const toTok = SWAP_TOKENS[toSym]
      if (!fromTok || !toTok) {
        return { error: `unsupported token. supported: ${Object.keys(SWAP_TOKENS).join(', ')}` }
      }
      const amount = String(args.amount)
      const num = Number(amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      const slippage = Math.min(50, Math.max(0.05, Number(args.slippagePct ?? 1)))
      const gp = await pub.getGasPrice()
      const gwei = Math.max(0.001, Number(gp) / 1e9)
      // OpenOcean aggregates Mantle DEXes (Merchant Moe, Agni, …) and returns a
      // ready-to-sign tx (to/value/data) with slippage protection — no
      // hand-encoded router calls.
      const url =
        `https://open-api.openocean.finance/v3/mantle/swap_quote?inTokenAddress=${fromTok.address}` +
        `&outTokenAddress=${toTok.address}&amount=${amount}&gasPrice=${gwei}&slippage=${slippage}` +
        `&account=${ctx.walletAddress}`
      const res = await fetch(url)
      const json = (await res.json().catch(() => null)) as {
        code?: number
        data?: { to?: string; value?: string; data?: string; outAmount?: string; minOutAmount?: string }
      } | null
      const d = json?.data
      if (json?.code !== 200 || !d?.to || !d?.data) {
        return { error: 'no swap route available right now (aggregator returned no tx)' }
      }
      const router = d.to as Address
      const isNativeIn = fromTok.address.toLowerCase() === NATIVE_SENTINEL
      const outHuman = d.outAmount ? formatUnits(BigInt(d.outAmount), toTok.decimals) : undefined
      const minOutHuman = d.minOutAmount ? formatUnits(BigInt(d.minOutAmount), toTok.decimals) : undefined

      // ERC-20 input must approve the router first.
      if (!isNativeIn) {
        const amountIn = parseUnits(amount, fromTok.decimals)
        const allowance = (await pub
          .readContract({
            address: fromTok.address as Address,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [ctx.walletAddress, router],
          })
          .catch(() => 0n)) as bigint
        if (allowance < amountIn) {
          const approveData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [router, amountIn],
          })
          return {
            proposed: true,
            kind: 'approve',
            from: ctx.walletAddress,
            to: fromTok.address,
            valueWei: '0',
            data: approveData,
            amount,
            label: `Approve ${amount} ${fromSym} for the swap`,
            note: `Approval needed before swapping ${fromSym}. After the user confirms it, ask to run the swap again to execute.`,
          }
        }
      }
      return {
        proposed: true,
        kind: 'swap',
        from: ctx.walletAddress,
        to: router,
        valueWei: isNativeIn ? (d.value ?? '0') : '0',
        data: d.data,
        amount,
        label: `Swap ${amount} ${fromSym} → ${toSym}`,
        expectedOut: outHuman ? `${outHuman} ${toSym}` : undefined,
        minOut: minOutHuman ? `${minOutHuman} ${toSym}` : undefined,
        note: `Routed via OpenOcean (Merchant Moe / Agni / …) at ${slippage}% max slippage. A "Confirm in wallet" button is shown — the user's wallet signs and broadcasts. Never claim it is already swapped.`,
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
    case 'send_mnt': {
      // The user's own connected wallet signs and broadcasts — the server never
      // holds a key, and no SIWE sign-in is required (the browser wallet signs).
      // We validate, enforce the policy cap, and simulate, then return a prepared
      // action the UI confirms in the wallet.
      const to = String(args.to) as Address
      if (!isAddress(to)) return { error: 'invalid recipient' }
      const amount = String(args.amount)
      const num = Number(amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      if (num > MAX_NATIVE_MNT) {
        return { error: `policy blocked: ${amount} MNT exceeds the ${MAX_NATIVE_MNT} MNT per-tx cap` }
      }
      const value = parseEther(amount)
      const gp = await pub.getGasPrice()
      return {
        proposed: true,
        kind: 'transfer',
        from: ctx.walletAddress ?? '',
        to,
        amount,
        valueWei: value.toString(),
        withinPolicyCap: true,
        policyCapMnt: MAX_NATIVE_MNT,
        estimatedGasMnt: formatEther(21000n * gp),
        note: 'Prepared and policy-checked. A "Confirm in wallet" button is shown — the user\'s connected wallet signs and broadcasts. Tell them to confirm in their wallet; never claim it is already sent.',
      }
    }
    case 'send_token': {
      const sym = String(args.token).toUpperCase().trim()
      const token = TOKENS.find(t => t.symbol === sym && t.address !== 'native')
      if (!token) {
        return { error: `unsupported token. supported: ${TOKENS.filter(t => t.address !== 'native').map(t => t.symbol).join(', ')}` }
      }
      const to = String(args.to) as Address
      if (!isAddress(to)) return { error: 'invalid recipient' }
      const num = Number(args.amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      const units = parseUnits(String(args.amount), token.decimals)
      const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, units] })
      return {
        proposed: true,
        kind: 'token-transfer',
        from: ctx.walletAddress ?? '',
        to: token.address,
        valueWei: '0',
        data,
        amount: String(args.amount),
        label: `Send ${args.amount} ${sym} to ${to.slice(0, 6)}…${to.slice(-4)}`,
        note: 'Prepared. A "Confirm in wallet" button is shown — the user signs the ERC-20 transfer. Never claim it is already sent.',
      }
    }
    case 'wrap_mnt': {
      const num = Number(args.amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      if (num > MAX_NATIVE_MNT) return { error: `policy blocked: ${args.amount} MNT exceeds the ${MAX_NATIVE_MNT} MNT per-tx cap` }
      const value = parseEther(String(args.amount))
      const data = encodeFunctionData({ abi: WETH9_ABI, functionName: 'deposit', args: [] })
      return {
        proposed: true,
        kind: 'wrap',
        from: ctx.walletAddress ?? '',
        to: WMNT,
        valueWei: value.toString(),
        data,
        amount: String(args.amount),
        label: `Wrap ${args.amount} MNT → WMNT`,
        note: 'Prepared. A "Confirm in wallet" button is shown — the user signs. Never claim it is already done.',
      }
    }
    case 'unwrap_mnt': {
      const num = Number(args.amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      const units = parseEther(String(args.amount))
      const data = encodeFunctionData({ abi: WETH9_ABI, functionName: 'withdraw', args: [units] })
      return {
        proposed: true,
        kind: 'unwrap',
        from: ctx.walletAddress ?? '',
        to: WMNT,
        valueWei: '0',
        data,
        amount: String(args.amount),
        label: `Unwrap ${args.amount} WMNT → MNT`,
        note: 'Prepared. A "Confirm in wallet" button is shown — the user signs. Never claim it is already done.',
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

/** An on-chain action prepared server-side (validated, policy-capped) for the
 *  user's connected wallet to sign + broadcast client-side. `to`/`valueWei`/
 *  `data` are the raw tx fields; native transfers omit `data`. */
export interface PendingAction {
  kind: 'transfer' | 'token-transfer' | 'wrap' | 'unwrap' | 'swap' | 'approve'
  from: string
  to: string
  amount: string
  valueWei: string
  data?: string
  label?: string
  estimatedGasMnt?: string
}

const PROPOSED_KINDS = new Set(['transfer', 'token-transfer', 'wrap', 'unwrap', 'swap', 'approve'])

export interface AgentResult {
  reply: string
  trace: { tool: string; args: unknown; result: unknown }[]
  pendingAction?: PendingAction
}

const SYSTEM_PROMPT = `You are nebula, a Mantle-native, policy-aware AI treasury assistant.
You operate on Mantle (chain 5000). Use the tools to answer with live on-chain data — never invent numbers.
The defensible idea: the AI advises, deterministic code enforces the fund controls. Value-moving actions
are policy-capped before they can broadcast; say so when you use them.
Actions execute from the user's OWN connected wallet: the prepare tools (send_mnt for native MNT, send_token
for ERC-20 transfers, wrap_mnt and unwrap_mnt for MNT↔WMNT) validate + policy-check + return a prepared tx,
and the UI shows a "Confirm in wallet" button — the user's wallet signs and broadcasts. ALWAYS use the
matching prepare tool when the user asks to send/transfer/wrap/unwrap. Never claim it was already done; say
it's prepared and ask them to confirm in their wallet. If no wallet is connected, tell them to connect (top-right).
Swaps execute from the user's connected wallet via swap_execute (routed across Mantle DEXes — Merchant Moe,
Agni, … — by the OpenOcean aggregator, with slippage protection). Use swap_execute whenever the user wants
to swap/trade/exchange; use swap_quote ONLY for a price estimate with no execution. An ERC-20 input may need
a one-time approve first — if an approve action is returned, tell the user to confirm it, then run the swap
again to execute. Never claim a swap happened until the user has confirmed it in their wallet.
Lending (supply/borrow/repay/withdraw) and staking are NOT executable in this web console yet — they're
available in the nebula CLI. Don't pretend to execute them; offer a quote/estimate or point to the CLI.
Be concise and concrete. When you cite a balance, yield, quote, or tx, it must come from a tool result.`

const OPENAI_URL = (process.env.NEBULA_LLM_BASE_URL ?? 'https://api.openai.com/v1') + '/chat/completions'
const MODEL = process.env.NEBULA_LLM_MODEL ?? 'gpt-4o-mini'

export interface RunAgentOptions {
  /** SIWE-authenticated wallet address for this request, if any. */
  authedAddress?: string | null
}

function extractPendingAction(trace: AgentResult['trace']): PendingAction | undefined {
  // Last prepared action wins (the one the user is being asked to confirm).
  for (let i = trace.length - 1; i >= 0; i--) {
    const r = trace[i].result as Record<string, unknown> | null
    if (
      r &&
      r.proposed === true &&
      typeof r.kind === 'string' &&
      PROPOSED_KINDS.has(r.kind) &&
      typeof r.valueWei === 'string'
    ) {
      return {
        kind: r.kind as PendingAction['kind'],
        from: String(r.from ?? ''),
        to: String(r.to ?? ''),
        amount: String(r.amount ?? ''),
        valueWei: String(r.valueWei),
        data: typeof r.data === 'string' ? r.data : undefined,
        label: typeof r.label === 'string' ? r.label : undefined,
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
