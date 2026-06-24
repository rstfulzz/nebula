/**
 * Web server-side Casper agent. An OpenAI-compatible tool-loop over live Casper
 * reads (balance, validators) and a policy-gated CSPR transfer + native stake,
 * executed server-side with the agent's secret key and verified on-chain.
 *
 * Same exports the API routes consume (`runAgent`, `ChatMessage`, `AgentResult`,
 * …). On Casper the agent signs server-side, so actions execute inline rather
 * than being prepared for a browser wallet to sign.
 */
import 'server-only'
import { readFileSync } from 'node:fs'
import {
  HttpHandler,
  KeyAlgorithm,
  NativeDelegateBuilder,
  NativeTransferBuilder,
  PrivateKey,
  PublicKey,
  PurseIdentifier,
  RpcClient,
} from 'casper-js-sdk'

const MOTES = 1_000_000_000
const MIN_TRANSFER_CSPR = 2.5
const MIN_DELEGATION_CSPR = 500
const MAX_NATIVE_CSPR = Number(process.env.NEBULA_POLICY_MAX_NATIVE_CSPR ?? '100')

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
}

export interface PendingAction {
  kind: 'transfer' | 'stake'
  from: string
  to: string
  amount: string
  label?: string
}

export interface AgentResult {
  reply: string
  trace: { tool: string; args: unknown; result: unknown }[]
  pendingAction?: PendingAction
  needsApproval?: boolean
  executed?: {
    kind: string
    label?: string
    txHash: string
    status: 'success' | 'reverted'
    from: string
    blockNumber?: number
  }
  executeError?: string
}

export interface RunAgentOptions {
  authedAddress?: string | null
  agentKey?: string | null
  approve?: boolean
  useTreasury?: boolean
}

const SYSTEM_PROMPT = `You are nebula, a Casper-native, policy-aware AI treasury agent (Casper Testnet).
Use the tools to answer with live on-chain data — never invent numbers. 1 CSPR = 1e9 motes.
The defensible idea: the AI advises, deterministic code enforces the fund controls. Value-moving
actions (casper_send transfer, casper_stake delegation) are policy-capped and verified on-chain
before you report success. casper_send requires >= 2.5 CSPR; casper_stake requires >= 500 CSPR.
Be concise and concrete; every balance/tx you cite must come from a tool result.`

const OPENAI_URL = `${process.env.NEBULA_LLM_BASE_URL ?? 'https://api.openai.com/v1'}/chat/completions`
const MODEL = process.env.NEBULA_LLM_MODEL ?? 'gpt-4o-mini'

function rpc(): RpcClient {
  const handler = new HttpHandler(
    process.env.CASPER_NODE_RPC ?? 'https://node.testnet.cspr.cloud/rpc',
  )
  const key = process.env.CSPR_CLOUD_API_KEY
  if (key) handler.setCustomHeaders({ Authorization: key })
  return new RpcClient(handler)
}

function signer(): PrivateKey | null {
  const path = process.env.CASPER_SECRET_KEY_PATH
  if (!path) return null
  try {
    return PrivateKey.fromPem(readFileSync(path, 'utf8'), KeyAlgorithm.SECP256K1)
  } catch {
    return null
  }
}

async function balanceCspr(client: RpcClient, pub: PublicKey): Promise<number> {
  const res = (await client.queryLatestBalance(PurseIdentifier.fromPublicKey(pub))) as {
    balance?: { toString(): string }
  }
  return Number(BigInt((res.balance ?? res).toString())) / MOTES
}

async function waitExecuted(
  client: RpcClient,
  hash: string,
): Promise<{ success: boolean; error?: string }> {
  const any = client as unknown as {
    getTransactionByTransactionHash?: (h: string) => Promise<unknown>
  }
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    try {
      const r = (await any.getTransactionByTransactionHash?.(hash)) as {
        executionInfo?: { executionResult?: { errorMessage?: string } }
      }
      const exec = r?.executionInfo?.executionResult
      if (exec) return { success: !exec.errorMessage, error: exec.errorMessage }
    } catch {
      /* keep polling */
    }
  }
  return { success: false, error: 'not executed within timeout' }
}

const TOOLS = [
  { type: 'function', function: { name: 'casper_balance', description: "The connected wallet's CSPR balance.", parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'casper_validators', description: 'List current validators.', parameters: { type: 'object', properties: { limit: { type: 'number' } } } } },
  { type: 'function', function: { name: 'casper_send', description: 'Transfer CSPR to a hex public key (>= 2.5).', parameters: { type: 'object', properties: { to: { type: 'string' }, amountCspr: { type: 'number' } }, required: ['to', 'amountCspr'] } } },
  { type: 'function', function: { name: 'casper_stake', description: 'Delegate CSPR to a validator (>= 500).', parameters: { type: 'object', properties: { validator: { type: 'string' }, amountCspr: { type: 'number' } }, required: ['validator', 'amountCspr'] } } },
]

async function dispatch(
  name: string,
  args: Record<string, unknown>,
  result: AgentResult,
  authedAddress?: string | null,
): Promise<unknown> {
  const client = rpc()
  const sk = signer()
  const pub = sk?.publicKey
  // Reads run under the connected wallet (the owner); writes use the server
  // signer (the bounded agent). So a connected browser wallet sees its own
  // balance even when the server has no signer.
  let readPub: PublicKey | null = pub ?? null
  if (authedAddress) {
    try {
      readPub = PublicKey.fromHex(authedAddress)
    } catch {
      /* malformed address → fall back to the server pub */
    }
  }
  switch (name) {
    case 'casper_balance':
      if (!readPub) return { error: 'no wallet connected' }
      return { cspr: await balanceCspr(client, readPub) }
    case 'casper_validators': {
      const info = (await (client as unknown as { getLatestAuctionInfo?: () => Promise<unknown> }).getLatestAuctionInfo?.()) as {
        auctionState?: { bids?: { publicKey?: { toHex(): string } }[] }
      }
      const bids = info?.auctionState?.bids ?? []
      const limit = typeof args.limit === 'number' ? args.limit : 5
      return { validators: bids.slice(0, limit).map((b) => b?.publicKey?.toHex?.() ?? String(b?.publicKey)) }
    }
    case 'casper_send': {
      if (!sk || !pub) return { error: 'no signer configured' }
      const amount = Number(args.amountCspr)
      const to = String(args.to)
      if (amount < MIN_TRANSFER_CSPR) return { error: `minimum transfer is ${MIN_TRANSFER_CSPR} CSPR` }
      if (amount > MAX_NATIVE_CSPR) return { error: `policy blocked: ${amount} CSPR exceeds the ${MAX_NATIVE_CSPR} CSPR cap` }
      const tx = new NativeTransferBuilder()
        .from(pub)
        .target(PublicKey.fromHex(to))
        .amount(String(Math.round(amount * MOTES)))
        .id(Date.now())
        .chainName(process.env.CASPER_CHAIN_NAME ?? 'casper-test')
        .payment(100_000_000)
        .build()
      tx.sign(sk)
      const submitted = (await client.putTransaction(tx)) as { transactionHash?: { toHex?(): string } }
      const hash = submitted.transactionHash?.toHex?.() ?? String(submitted.transactionHash ?? submitted)
      const status = await waitExecuted(client, hash)
      if (!status.success) {
        result.executeError = status.error
        return { ok: false, error: status.error, hash }
      }
      result.executed = { kind: 'transfer', txHash: hash, status: 'success', from: pub.toHex() }
      return { ok: true, hash, amountCspr: amount, recipient: to }
    }
    case 'casper_stake': {
      if (!sk || !pub) return { error: 'no signer configured' }
      const amount = Number(args.amountCspr)
      const validator = String(args.validator)
      if (amount < MIN_DELEGATION_CSPR) return { error: `minimum delegation is ${MIN_DELEGATION_CSPR} CSPR` }
      if (amount > MAX_NATIVE_CSPR) return { error: `policy blocked: ${amount} CSPR exceeds the ${MAX_NATIVE_CSPR} CSPR cap` }
      const tx = new NativeDelegateBuilder()
        .validator(PublicKey.fromHex(validator))
        .from(pub)
        .amount(String(Math.round(amount * MOTES)))
        .chainName(process.env.CASPER_CHAIN_NAME ?? 'casper-test')
        .payment(2_500_000_000)
        .build()
      tx.sign(sk)
      const submitted = (await client.putTransaction(tx)) as { transactionHash?: { toHex?(): string } }
      const hash = submitted.transactionHash?.toHex?.() ?? String(submitted.transactionHash ?? submitted)
      const status = await waitExecuted(client, hash)
      if (!status.success) {
        result.executeError = status.error
        return { ok: false, error: status.error, hash }
      }
      result.executed = { kind: 'stake', txHash: hash, status: 'success', from: pub.toHex() }
      return { ok: true, hash, amountCspr: amount, validator }
    }
    default:
      return { error: `unknown tool ${name}` }
  }
}

export function treasuryConfigured(): boolean {
  return false
}

export async function executeAction(
  _agentKey: string,
  _pa: PendingAction,
): Promise<NonNullable<AgentResult['executed']>> {
  throw new Error('On Casper, actions execute inline in runAgent — no separate prepared-action step.')
}

export async function executeViaTreasury(
  _pa: PendingAction,
): Promise<NonNullable<AgentResult['executed']>> {
  throw new Error('On Casper, actions execute inline in runAgent — no Safe/treasury step.')
}

export async function runAgent(history: ChatMessage[], opts: RunAgentOptions = {}): Promise<AgentResult> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEBULA_LLM_API_KEY
  if (!apiKey) {
    return { reply: 'The agent brain is not configured (no OPENAI_API_KEY on the server).', trace: [] }
  }
  const result: AgentResult = { reply: '', trace: [] }
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history]

  for (let step = 0; step < 8; step++) {
    const resp = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: 'auto' }),
    })
    if (!resp.ok) return { ...result, reply: `brain error: ${resp.status}` }
    const data = (await resp.json()) as {
      choices?: { message?: ChatMessage }[]
    }
    const msg = data.choices?.[0]?.message
    if (!msg) return { ...result, reply: '(no reply)' }
    messages.push(msg)
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      result.reply = msg.content ?? '(no reply)'
      return result
    }
    for (const call of msg.tool_calls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments || '{}')
      } catch {
        /* tolerate bad args */
      }
      const toolResult = await dispatch(call.function.name, args, result, opts.authedAddress)
      result.trace.push({ tool: call.function.name, args, result: toolResult })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolResult) })
    }
  }
  result.reply = result.reply || 'stopped after too many tool steps.'
  return result
}
