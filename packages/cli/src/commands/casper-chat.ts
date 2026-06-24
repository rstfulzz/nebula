/**
 * `nebula` / `nebula chat` — the Casper agent REPL.
 *
 * Wires the chain-agnostic core brain to the Casper on-chain tools. Interactive
 * by default; pass a prompt (`nebula chat "what is my balance"`) for one-shot.
 *
 * Env (.env): OPENAI_API_KEY (or NEBULA_LLM_*), CSPR_CLOUD_API_KEY,
 * CASPER_NODE_RPC, CASPER_CHAIN_NAME, CASPER_SECRET_KEY_PATH.
 */
import * as readline from 'node:readline/promises'
import {
  type BrainMessage,
  OpenAIBrain,
  ToolRegistry,
  buildFrozenPrefix,
  newEventId,
} from 'nebula-ai-core'
import { buildCasperOnchainFromEnv, casperTools, csprToMotes } from 'nebula-ai-plugin-onchain'

const SYSTEM_PROMPT =
  'You are Nebula, a Casper-native treasury agent. Use the casper.* tools to read chain state and execute policy-gated actions on Casper Testnet. 1 CSPR = 1e9 motes. Every write is policy-checked and verified on-chain; never expose secrets.'

function makeBrain(yolo: boolean) {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.NEBULA_LLM_API_KEY
  if (!apiKey) {
    throw new Error('Set OPENAI_API_KEY (or NEBULA_LLM_API_KEY) to chat.')
  }
  const ctx = buildCasperOnchainFromEnv({
    policy: yolo
      ? undefined
      : {
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
      systemPrompt: SYSTEM_PROMPT,
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
      process.stdout.write(
        `  ▸ ${call.name} ${ok ? '✅' : `⛔ ${(result as { error?: string }).error ?? ''}`}\n`,
      )
      return { role: 'tool', content: JSON.stringify(result) } as BrainMessage
    },
  })
  return { brain, ctx }
}

async function ask(brain: OpenAIBrain, prompt: string): Promise<string> {
  const turn = await brain.infer({
    event: {
      id: newEventId(),
      source: 'cli',
      payload: { label: 'user-message', data: prompt },
      ts: Date.now(),
    },
    channelKey: 'cli',
  })
  return turn.content ?? '(no reply)'
}

export async function runChat(opts: { yolo?: boolean } = {}): Promise<void> {
  const { brain, ctx } = makeBrain(opts.yolo ?? false)
  await brain.init()

  // One-shot: `nebula chat "what is my balance"`.
  const oneShot = process.argv
    .slice(3)
    .filter(a => !a.startsWith('--'))
    .join(' ')
    .trim()
  if (oneShot) {
    console.log(await ask(brain, oneShot))
    return
  }

  const pub = ctx.pub?.toHex().slice(0, 12) ?? '(no signer)'
  console.log(`nebula · Casper agent — ${ctx.network.network} — ${pub}…   ('exit' to quit)\n`)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  for (;;) {
    const line = (await rl.question('› ')).trim()
    if (line === 'exit' || line === 'quit') break
    if (line) console.log(`\n${await ask(brain, line)}\n`)
  }
  rl.close()
}
