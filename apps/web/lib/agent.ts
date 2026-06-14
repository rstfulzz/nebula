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
        'Send native MNT to an address. Policy-capped and simulated before broadcast. Only available when a server signer is configured.',
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

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_balance': {
      const s = signer()
      const addr = ((args.address as string) || s?.account.address || '') as Address
      if (!isAddress(addr)) return { error: 'no address (and no server signer)' }
      const [mnt, usdc] = await Promise.all([
        pub.getBalance({ address: addr }),
        pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [addr] }).catch(() => 0n),
      ])
      return { address: addr, MNT: formatEther(mnt), USDC: formatUnits(usdc as bigint, 6) }
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
      const s = signer()
      if (!s) return { error: 'no server signer configured — writes are disabled in this deployment.' }
      const to = String(args.to) as Address
      if (!isAddress(to)) return { error: 'invalid recipient' }
      const amount = String(args.amount)
      const num = Number(amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      if (num > MAX_NATIVE_MNT) return { error: `policy blocked: ${amount} MNT exceeds the ${MAX_NATIVE_MNT} MNT per-tx cap` }
      const value = parseEther(amount)
      // Simulate (estimate gas) before broadcast.
      await pub.estimateGas({ account: s.account.address, to, value })
      const hash = await s.wallet.sendTransaction({ to, value, chain: mantle, account: s.account })
      await pub.waitForTransactionReceipt({ hash })
      return { ok: true, txHash: hash, amount, to, explorer: `https://mantlescan.xyz/tx/${hash}`, policyEnforced: true }
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

export interface AgentResult {
  reply: string
  trace: { tool: string; args: unknown; result: unknown }[]
}

const SYSTEM_PROMPT = `You are nebula, a Mantle-native, policy-aware AI treasury assistant.
You operate on Mantle (chain 5000). Use the tools to answer with live on-chain data — never invent numbers.
The defensible idea: the AI advises, deterministic code enforces the fund controls. Value-moving actions
(like send_mnt) are policy-capped and simulated before broadcast; say so when you use them.
Be concise and concrete. When you cite a balance, yield, or tx, it must come from a tool result.`

const OPENAI_URL = (process.env.NEBULA_LLM_BASE_URL ?? 'https://api.openai.com/v1') + '/chat/completions'
const MODEL = process.env.NEBULA_LLM_MODEL ?? 'gpt-4o-mini'

export async function runAgent(history: ChatMessage[]): Promise<AgentResult> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEBULA_LLM_API_KEY
  if (!apiKey) return { reply: 'The agent brain is not configured (no OPENAI_API_KEY on the server).', trace: [] }

  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history]
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
      return { reply: msg.content || '(no reply)', trace }
    }

    for (const call of msg.tool_calls) {
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(call.function.arguments || '{}')
      } catch {}
      let result: unknown
      try {
        result = await runTool(call.function.name, parsed)
      } catch (e) {
        result = { error: (e as Error).message }
      }
      trace.push({ tool: call.function.name, args: parsed, result })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
  return { reply: 'Stopped after several tool calls without a final answer — try rephrasing.', trace }
}
