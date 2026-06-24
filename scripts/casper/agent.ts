/**
 * Nebula Casper agent — the chain-agnostic brain wired to the Casper on-chain
 * tools. A real conversational agent that reads chain state and executes
 * policy-gated actions on Casper Testnet.
 *
 *   bun run scripts/casper/agent.ts "what is my CSPR balance? list 3 validators"
 *
 * Env (from .env): OPENAI_API_KEY (or NEBULA_LLM_*), CSPR_CLOUD_API_KEY,
 * CASPER_NODE_RPC, CASPER_CHAIN_NAME, CASPER_SECRET_KEY_PATH.
 */
import {
  type BrainMessage,
  OpenAIBrain,
  ToolRegistry,
  buildFrozenPrefix,
  newEventId,
} from 'nebula-ai-core'
import {
  buildCasperOnchainFromEnv,
  casperTools,
  csprToMotes,
} from '../../packages/plugin-onchain/src/index'

const prompt = process.argv.slice(2).join(' ') || 'What is my CSPR balance? Also list 3 validators.'

const apiKey = process.env.OPENAI_API_KEY ?? process.env.NEBULA_LLM_API_KEY
if (!apiKey) {
  console.error('Set OPENAI_API_KEY (or NEBULA_LLM_API_KEY) to run the agent.')
  process.exit(1)
}

// Deterministic policy: auto under 5 CSPR, cap 100 CSPR/tx.
const ctx = buildCasperOnchainFromEnv({
  policy: {
    autonomy: 'auto',
    maxNativeMotesPerTx: csprToMotes(100),
    autoMaxNativeMotesPerTx: csprToMotes(5),
  },
})

const tools = new ToolRegistry()
for (const t of casperTools(ctx)) tools.register(t as Parameters<typeof tools.register>[0])

const brain = new OpenAIBrain({
  apiKey,
  baseUrl: process.env.NEBULA_LLM_BASE_URL,
  model: process.env.NEBULA_LLM_MODEL ?? 'gpt-4o-mini',
  tools: tools.schemas(),
  prefix: buildFrozenPrefix({
    systemPrompt:
      'You are Nebula, a Casper-native treasury agent. Use the casper.* tools to read chain state and execute policy-gated actions on Casper Testnet. 1 CSPR = 1e9 motes. Every write is policy-checked and verified on-chain; never expose secrets.',
    memoryIndex: null,
    identity: null,
    persona: null,
    loadedToolNames: tools.list().map(t => t.name),
    skills: [],
    timestamp: null,
  }),
  onToolCall: async call => {
    const result = await tools.dispatch(call as Parameters<typeof tools.dispatch>[0])
    const ok = (result as { ok?: boolean }).ok !== false
    console.log(
      `  ▸ ${call.name} ${ok ? '✅' : `⛔ ${(result as { error?: string }).error ?? ''}`}`,
    )
    return { role: 'tool', content: JSON.stringify(result) } as BrainMessage
  },
})
await brain.init()

console.log(`\n> ${prompt}\n`)
const turn = await brain.infer({
  event: {
    id: newEventId(),
    source: 'cli',
    payload: { label: 'user-message', data: prompt },
    ts: Date.now(),
  },
  channelKey: 'cli',
})
console.log(`\n${turn.content ?? '(no reply)'}`)
