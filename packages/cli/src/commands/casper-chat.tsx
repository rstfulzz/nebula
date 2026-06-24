/**
 * `nebula` / `nebula chat` — the Casper agent TUI.
 *
 * Renders the @opentui/solid terminal UI (chat history, streamed assistant
 * rows, per-tool-call rows, slash-command autocomplete, status footer) on top
 * of the same chain-agnostic core brain wired to the Casper on-chain tools.
 *
 * Interactive by default. Pass a prompt (`nebula chat "what is my balance"`)
 * for a one-shot answer that bypasses the TUI and prints to stdout.
 *
 * Env (.env): OPENAI_API_KEY (or NEBULA_LLM_*), CSPR_CLOUD_API_KEY,
 * CASPER_NODE_RPC, CASPER_CHAIN_NAME, CASPER_SECRET_KEY_PATH.
 */
import {
  type BrainMessage,
  DEMO_LLM_BASE_URL,
  DEMO_LLM_TOKEN,
  OpenAIBrain,
  type PermissionMode,
  ToolRegistry,
  applyPerms,
  applyYolo,
  buildFrozenPrefix,
  newEventId,
} from 'nebula-ai-core'
import {
  type CasperOnchainContext,
  buildCasperOnchainFromEnv,
  casperTools,
  csprToMotes,
} from 'nebula-ai-plugin-onchain'
import { createChatState } from '../ui/state'
import { shortAddr } from '../util/format'

const SYSTEM_PROMPT =
  'You are Nebula, a Casper-native treasury agent. Use the casper.* tools to read chain state and execute policy-gated actions on Casper Testnet. 1 CSPR = 1e9 motes. Every write is policy-checked and verified on-chain; never expose secrets.'

/**
 * Squash a casper.* tool call's args to a one-line `k=v` summary for the
 * tool-call row. Long values are truncated; only the first 3 keys are shown so
 * the row stays on one terminal line.
 */
function summarizeArgs(args: unknown): string {
  if (typeof args !== 'object' || args === null) return String(args ?? '').slice(0, 60)
  const entries = Object.entries(args as Record<string, unknown>)
  return entries
    .map(([k, v]) => {
      const s = typeof v === 'string' ? v : JSON.stringify(v)
      return `${k}=${s.length > 40 ? `${s.slice(0, 40)}…` : s}`
    })
    .slice(0, 3)
    .join(', ')
}

/**
 * Squash a casper.* ToolResult to a single-line summary for the tool-result
 * row. The TUI adds the `⎿`/`✗` indent + color from the role; this returns
 * just the content. Failed calls surface the (truncated) error; successes
 * prefer a deploy hash or simple `ok`.
 */
function summarizeToolResult(result: unknown): string {
  const r = result as
    | { ok?: boolean; error?: string; deployHash?: string; data?: { deployHash?: string } }
    | null
    | undefined
  if (!r || r.ok === undefined) return 'done'
  if (r.ok === false) return (r.error ?? 'failed').slice(0, 200)
  const hash =
    typeof r.deployHash === 'string'
      ? r.deployHash
      : typeof r.data?.deployHash === 'string'
        ? r.data.deployHash
        : null
  return hash ? `deploy ${shortAddr(hash)}` : 'ok'
}

/**
 * Build the keyless brain + Casper on-chain context, pushing each tool call
 * into the supplied ChatState as a tool-call row followed by a ✅/✗
 * tool-result row (mirrors the plain REPL's `▸ name ✅/⛔` line, but rendered
 * into the TUI instead of stdout).
 */
function makeBrain(
  yolo: boolean,
  onToolRows: {
    pushCall: (toolName: string, args: string) => void
    pushResult: (text: string, failed: boolean) => void
  },
): { brain: OpenAIBrain; ctx: CasperOnchainContext } {
  // Keyless by default: with no personal LLM key, fall back to the hosted,
  // rate-limited demo proxy (it holds the real key) so the user doesn't set one.
  const userKey = process.env.OPENAI_API_KEY ?? process.env.NEBULA_LLM_API_KEY
  const apiKey = userKey ?? DEMO_LLM_TOKEN
  const baseUrl = process.env.NEBULA_LLM_BASE_URL ?? (userKey ? undefined : DEMO_LLM_BASE_URL)
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
    baseUrl,
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
      onToolRows.pushCall(call.name, summarizeArgs(call.args))
      const result = await tools.dispatch(call as Parameters<typeof tools.dispatch>[0])
      const ok = (result as { ok?: boolean }).ok !== false
      onToolRows.pushResult(summarizeToolResult(result), !ok)
      return { role: 'tool', content: JSON.stringify(result) } as BrainMessage
    },
  })
  return { brain, ctx }
}

/**
 * One-shot path: `nebula chat "what is my balance"`. Bypasses the TUI and
 * prints the assistant reply to stdout so it composes in pipes / scripts.
 */
async function askOnce(brain: OpenAIBrain, prompt: string): Promise<string> {
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
  const yolo = opts.yolo ?? false

  // TUI rows are pushed via this slot once the ChatState exists. During the
  // one-shot path (below) it stays a no-op, so tool calls don't try to render.
  const toolRowSink: {
    pushCall: ((toolName: string, args: string) => void) | null
    pushResult: ((text: string, failed: boolean) => void) | null
  } = { pushCall: null, pushResult: null }
  const { brain, ctx } = makeBrain(yolo, {
    pushCall: (toolName, args) => toolRowSink.pushCall?.(toolName, args),
    pushResult: (text, failed) => toolRowSink.pushResult?.(text, failed),
  })
  await brain.init()

  // One-shot: `nebula chat "what is my balance"`.
  const oneShot = process.argv
    .slice(3)
    .filter(a => !a.startsWith('--'))
    .join(' ')
    .trim()
  if (oneShot) {
    console.log(await askOnce(brain, oneShot))
    return
  }

  const initialMode: PermissionMode = yolo ? 'off' : 'prompt'
  const pubLabel = ctx.pub ? shortAddr(ctx.pub.toHex()) : '(no signer)'
  const state = createChatState({
    initialSystem: yolo
      ? 'connected. YOLO mode: policy fund-control disabled.'
      : 'connected. type messages and press enter.',
    identityLabel: `casper ${ctx.network.network}  ${pubLabel}`,
    approvalsMode: initialMode,
    // Embedded CLI runs in-process on the operator's machine — local. Tag it so
    // the status footer hides the sandbox-billing segment.
    isLocalGateway: true,
  })

  // Wire the tool-row sink at the ChatState now that it exists.
  toolRowSink.pushCall = (toolName, args) =>
    state.pushRow({ role: 'tool-call', text: '', toolName, args })
  toolRowSink.pushResult = (text, failed) => state.pushRow({ role: 'tool-result', text, failed })

  // In-memory permission toggle. The real fund-control policy is set on the
  // Casper context at build time (every casper.* write self-checks it), so
  // /yolo /perms here drive the status-footer label for this session. Re-arming
  // policy mid-session would require rebuilding the agent, so we surface that.
  let permMode: PermissionMode = initialMode
  const permApi = {
    getMode: () => permMode,
    setMode: (m: PermissionMode) => {
      permMode = m
    },
  }

  // @opentui/solid + @opentui/core are dynamic-imported so the JSX transform
  // (registered by the preload in bin/nebula) is in place before the renderer
  // loads, and so the one-shot path above never pays the renderer import cost.
  const { render } = await import('@opentui/solid')
  const { createCliRenderer } = await import('@opentui/core')
  const { ChatApp } = await import('../ui/app')

  // opentui owns the alt-screen; any stray stdout (SDK chatter, RPC warnings)
  // would fall through and corrupt the chat UI. Redirect console.* to a log
  // file under the agent dir. process.stdout stays intact — opentui writes there.
  const { createWriteStream } = await import('node:fs')
  const chatLog = createWriteStream(`${ctx.agentDir}/chat.log`, { flags: 'a' })
  const stringifyArg = (a: unknown): string => {
    if (typeof a === 'string') return a
    if (a instanceof Error) return a.stack ?? a.message
    try {
      return JSON.stringify(a, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v))
    } catch {
      return String(a)
    }
  }
  const logTo =
    (level: string) =>
    (...args: unknown[]) => {
      chatLog.write(
        `[${new Date().toISOString()}] [${level}] ${args.map(stringifyArg).join(' ')}\n`,
      )
    }
  console.log = logTo('log') as typeof console.log
  console.warn = logTo('warn') as typeof console.warn
  console.error = logTo('error') as typeof console.error
  console.info = logTo('info') as typeof console.info
  console.debug = logTo('debug') as typeof console.debug
  process.on('unhandledRejection', err => {
    chatLog.write(`[unhandled] ${(err as Error)?.stack ?? String(err)}\n`)
  })

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    consoleMode: 'disabled',
    openConsoleOnError: false,
  })

  const handleExit = (): void => {
    try {
      renderer.destroy()
    } catch {
      // renderer already torn down; nothing to do.
    }
    process.exit(0)
  }

  const handleSlash = async (cmd: string): Promise<boolean> => {
    if (cmd === '/exit' || cmd === '/quit') {
      state.pushRow({ role: 'system', text: 'goodbye.' })
      handleExit()
      return true
    }
    if (cmd === '/yolo') {
      const result = applyYolo(permApi)
      state.setApprovalsMode(result.mode)
      state.pushRow({
        role: 'system',
        text: `${result.message} (note: fund-control policy is fixed for this session; re-launch nebula to change it.)`,
      })
      return true
    }
    if (cmd === '/perms' || cmd.startsWith('/perms ')) {
      const arg = cmd.split(/\s+/)[1]
      const result = applyPerms(permApi, arg)
      state.setApprovalsMode(result.mode)
      state.pushRow({ role: 'system', text: result.message })
      return true
    }
    if (cmd === '/reset') {
      try {
        await brain.clearChannel?.('tui:stdin')
        state.pushRow({ role: 'system', text: 'conversation reset (TUI channel cleared)' })
      } catch (e) {
        state.pushRow({
          role: 'system',
          text: `reset error: ${(e as Error).message.slice(0, 200)}`,
        })
      }
      return true
    }
    if (cmd === '/help') {
      state.pushRow({
        role: 'system',
        text: [
          'slash commands:',
          '  /yolo                toggle the fund-control label off/on for this session',
          '  /perms <mode>        set permission label (off|prompt|strict); no arg shows current',
          '  /reset               clear this channel’s conversation history',
          '  /exit                quit nebula',
          '  /help                this message',
        ].join('\n'),
      })
      return true
    }
    return false
  }

  const handleSubmit = async (text: string): Promise<void> => {
    const trimmed = text.trim()
    if (trimmed.startsWith('/')) {
      const handled = await handleSlash(trimmed)
      if (handled) {
        // Slash commands skip brain.infer; reset thinking → idle so the spinner
        // row stops (app.tsx flips status='thinking' on every Enter).
        state.setStatus('idle')
        return
      }
    }
    // Per-turn AbortController. Esc in the TUI calls .abort() on this; stored on
    // state so app.tsx's keyboard handler can reach it.
    const abortCtrl = new AbortController()
    state.setActiveAbort(abortCtrl)
    try {
      const turn = await brain.infer({
        event: {
          id: newEventId(),
          source: 'stdin',
          payload: { label: 'user-message', data: text },
          ts: Date.now(),
        },
        channelKey: 'tui:stdin',
        signal: abortCtrl.signal,
        onCompactionEvent: ev => {
          state.pushRow({
            role: 'system',
            text: `✂︎ context compacted (${ev.from} → ${ev.to} messages, ~${Math.round(ev.promptTokens / 1000)}K tokens)`,
          })
        },
      })
      state.pushRow({ role: 'assistant', text: turn.content ?? '(no content)' })
      state.setStatus('idle')
      if (turn.usage) {
        state.setUsage({ total: turn.usage.totalTokens, cached: turn.usage.cachedTokens })
      }
    } catch (e) {
      // AbortError = operator pressed Esc; render as a clean sys row, not an error.
      if ((e instanceof Error && e.name === 'AbortError') || abortCtrl.signal.aborted) {
        state.pushRow({
          role: 'system',
          text: 'turn interrupted (esc). brain stopped at the last completed step.',
        })
        state.setStatus('idle')
        return
      }
      const errMsg = e instanceof Error ? e.message : String(e ?? 'unknown error')
      console.error('[handleSubmit] error:', e instanceof Error ? (e.stack ?? e.message) : errMsg)
      state.pushRow({ role: 'system', text: `error: ${errMsg.slice(0, 300)}` })
      state.setStatus('error')
    } finally {
      state.setActiveAbort(null)
    }
  }

  await render(
    () => <ChatApp state={state} onSubmit={handleSubmit} onExit={handleExit} />,
    renderer,
  )

  // @opentui/solid's render() resolves once the component mounts; it does not
  // block. The renderer's animation loop runs off the main thread, so nothing
  // keeps the event loop alive after render returns. Anchor on a never-resolving
  // promise; handleExit (via process.exit) is the only escape.
  await new Promise<void>(() => {
    // Block forever; only handleExit escapes this.
  })
}
