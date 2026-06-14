import { spinner } from '@clack/prompts'
import {
  NETWORK_RPC,
  type NebulaConfig,
  type PermissionDecision,
  type PermissionRequest,
  agentPaths,
  iNFTAgentId,
} from 'nebula-ai-core'
import type { GatewayEventKind } from 'nebula-ai-gateway'
import { http, type Address, createPublicClient, formatEther } from 'viem'
import { SandboxClient } from '../sandbox/client'
import { summarizeApprovalSubject } from '../ui/approval-summary'
import { loadOrPickOperatorSigner } from './init/operator-picker'

/**
 * Local-gateway chat loop. Runs in iNFT mode when chat.tsx detects a running
 * gateway daemon socket at `~/.nebula/agents/<id>/gateway.sock` and calls this
 * with `unixSocketPath`. The CLI is a thin client to the gateway daemon: chat
 * goes via POST /chat (signed), tool indicators + listener events stream via
 * /events SSE, approval modal round-trips via POST /approval/:id/respond.
 *
 * The agent's privkey lives in the gateway daemon process, not here.
 */
export interface RunChatSandboxOpts {
  /**
   * When set, the client routes via this unix socket. Used for the
   * local-gateway-daemon path: chat.tsx detects
   * `~/.nebula/agents/<id>/gateway.sock` and calls runChatSandbox with this opt.
   */
  unixSocketPath?: string
}

export async function runChatSandbox(
  config: NebulaConfig,
  opts: RunChatSandboxOpts = {},
): Promise<void> {
  if (!config.identity.iNFT || !config.identity.agent) {
    console.log('Config has no iNFT or agent. Re-run `nebula init`.')
    process.exit(1)
  }
  if (!opts.unixSocketPath) {
    console.log('No local gateway socket; start the daemon with `nebula gateway start`.')
    process.exit(1)
  }
  const unixSocketPath = opts.unixSocketPath

  const contractAddress = config.identity.iNFT.contract as Address
  const tokenId = BigInt(config.identity.iNFT.tokenId)
  const agentId = iNFTAgentId({ contractAddress, tokenId })
  const agentAddress = config.identity.agent as Address
  const sandboxEndpoint = 'http://localhost'
  const sandboxId = `local-${agentId.slice(0, 8)}`

  const operator = await loadOrPickOperatorSigner({
    network: config.network,
    hint: config.operator,
  })
  if (!operator) {
    console.log('No operator wallet available; cannot sign chat messages.')
    process.exit(1)
  }
  const operatorAccount = await operator.account()

  const client = new SandboxClient({
    endpoint: sandboxEndpoint,
    sandboxId,
    operator: operatorAccount,
    unixSocketPath,
  })

  const sReady = spinner()
  sReady.start('Connecting to local gateway socket')
  // v0.21.13: capture initial perms mode from /healthz so the TUI statusline
  // reflects the gateway's actual PermissionService state (not hardcoded 'off').
  let initialPermsMode: 'off' | 'prompt' | 'strict' = 'off'
  try {
    const health = await client.waitReady({ timeoutMs: 8_000, intervalMs: 1000 })
    if (health.permsMode) initialPermsMode = health.permsMode
    sReady.stop(`gateway ready (uptime ${(health.uptimeMs / 1000).toFixed(0)}s)`)
  } catch {
    // The local gateway daemon is either alive or it isn't. Tell the user to
    // (re)start it and exit.
    sReady.stop(
      `gateway unreachable at ${unixSocketPath} — try \`nebula gateway start\` then re-run`,
    )
    await operator.close?.()
    process.exit(1)
  }

  // opentui import dance: render() runs the chat UI; clack spinners must
  // finish before we hand stdin off to opentui (see comment in chat.tsx).
  const { render } = await import('@opentui/solid')
  const { createCliRenderer } = await import('@opentui/core')
  const { createChatState } = await import('../ui/state')
  const { ChatApp } = await import('../ui/app')

  const state = createChatState({
    // Local-gateway TUI talks to a daemon over a unix socket
    // (`~/.nebula/agents/<id>/gateway.sock`).
    initialSystem: `connected to local gateway (${agentPaths.agent(agentId).dir}/gateway.sock)`,
    // v0.22.0: subname (if registered) + full EOA. Brain provider dropped.
    identityLabel: `agent ${config.subname ?? agentId}  ${agentAddress}`,
    // v0.21.13: seeded from /healthz.permsMode so the statusline reflects
    // the gateway's actual mode after auto-spawn / restart cycles. The
    // statusline subsequently updates locally via the /yolo and /perms
    // slash handlers below.
    approvalsMode: initialPermsMode,
    // Local gateway: the statusbar hides the (now removed) sandbox-billing
    // balance segment. See state.ts.
    isLocalGateway: true,
  })

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    consoleMode: 'disabled',
    openConsoleOnError: false,
  })

  // Pending approval id → forward to harness via signed POST. The TUI's
  // existing y/s/n handler calls `pending.resolve(decision)`; our resolver
  // fires off the signed POST. Local promise resolves immediately (the
  // harness's ApprovalRelay handles the actual permission unblock).
  const approvalIdRef: { current: string | null } = { current: null }

  const renderEvent = (kind: GatewayEventKind, data: unknown): void => {
    const d = data as Record<string, unknown>
    switch (kind) {
      case 'tool-call-start':
        state.pushRow({
          role: 'tool-call',
          text: '',
          toolName: String(d.name ?? '?'),
          args: String(d.args ?? ''),
          autoEscalated: d.autoEscalated === true,
        })
        break
      case 'tool-call-end':
        state.pushRow({
          role: 'tool-result',
          text: String(d.summary ?? (d.ok ? 'ok' : 'failed')),
          failed: d.ok === false,
          autoEscalated: d.autoEscalated === true,
        })
        break
      case 'sync-flush': {
        const tx = String(d.txHash ?? '')
        const slots = Array.isArray(d.slots) ? (d.slots as string[]).join(', ') : ''
        const explorer = String(d.explorer ?? '')
        state.pushRow({
          role: 'system',
          text: explorer ? `synced ${slots} → ${explorer}` : `synced ${slots} (tx ${tx})`,
        })
        break
      }
      case 'context-compacted': {
        const from = Number(d.from ?? 0)
        const to = Number(d.to ?? 0)
        const tokens = Number(d.promptTokens ?? 0)
        const tokensHint = tokens > 0 ? ` (~${Math.round(tokens / 1000)}k tokens)` : ''
        state.pushRow({
          role: 'system',
          text: `✂︎ context compacted ${from} → ${to} messages${tokensHint}`,
        })
        break
      }
      case 'auto-topup': {
        const message = String(d.message ?? '')
        const kind = String(d.kind ?? '')
        const prefix =
          kind === 'topup-fired' ? '⚡ topup' : kind === 'wallet-low' ? '⚠ wallet' : '✗ topup'
        state.pushRow({ role: 'system', text: `${prefix}  ${message}` })
        break
      }
      case 'listener-event': {
        const k = String(d.kind ?? '')
        if (k === 'a2a-delivered') {
          state.pushRow({
            role: 'inbox',
            text: `from ${d.fromLabel ?? d.from} · ${d.preview ?? ''}`,
          })
        } else if (k === 'market-job') {
          state.pushRow({
            role: 'market',
            text: `job#${d.jobId ?? '?'} · ${d.jobKind ?? '?'} · tx ${String(d.txHash ?? '').slice(0, 10)}`,
          })
        } else if (k === 'a2a-notice') {
          state.pushRow({
            role: 'system',
            text: `inbox notice: ${d.noticeKind ?? '?'} from ${d.from ?? ''}`,
          })
        } else if (k === 'telegram-inbound') {
          const who = d.username ? `@${d.username}` : `id=${d.userId ?? '?'}`
          state.pushRow({
            role: 'inbox-tg',
            text: `tg ${who} · ${d.preview ?? ''}`,
          })
        } else if (k === 'telegram-outbound') {
          state.pushRow({
            role: 'system',
            text: `tg out → chat ${d.chatId ?? '?'} · ${d.length ?? 0} chars`,
          })
        } else if (k === 'telegram-processing-start') {
          state.pushRow({
            role: 'system',
            text: `tg replying to chat ${d.chatId ?? '?'}`,
          })
        } else if (k === 'telegram-processing-end') {
          state.pushRow({
            role: 'system',
            text: d.ok
              ? `tg reply sent to chat ${d.chatId ?? '?'}`
              : `tg reply FAILED to chat ${d.chatId ?? '?'}`,
          })
        }
        break
      }
      case 'approval-needed': {
        const req = (d.payload ?? {}) as PermissionRequest
        const id = String(d.id ?? '')
        approvalIdRef.current = id
        state.pushRow({
          role: 'system',
          text: `[approval requested] ${req.reason}: ${summarizeApprovalSubject(req)}`,
        })
        state.setPendingApproval({
          request: req,
          resolve: (decision: PermissionDecision) => {
            // Fire-and-forget: harness ApprovalRelay handles the resolve.
            void client.approve(id, decision).catch(err => {
              state.pushRow({
                role: 'system',
                text: `approval send failed: ${(err as Error).message.slice(0, 200)}`,
              })
            })
            approvalIdRef.current = null
          },
        })
        break
      }
      case 'approval-expired':
        if (approvalIdRef.current === d.id) {
          state.setPendingApproval(null)
          approvalIdRef.current = null
        }
        state.pushRow({ role: 'system', text: `approval ${d.id ?? '?'} expired` })
        break
      case 'state-change':
        if (d.state === 'ShuttingDown') {
          state.pushRow({ role: 'system', text: 'harness state: ShuttingDown' })
        }
        break
      case 'log':
        // Suppressed unless verbose flag set; for v0.15.0 keep silent.
        break
      default:
        break
    }
  }

  const eventSignal = new AbortController()
  const eventLoop = (async () => {
    try {
      for await (const ev of client.events({ signal: eventSignal.signal, clientKind: 'tui' })) {
        renderEvent(ev.kind, ev.data)
      }
    } catch (err) {
      if (eventSignal.signal.aborted) return
      state.pushRow({
        role: 'system',
        text: `event stream lost: ${(err as Error).message}`,
      })
    }
  })()

  // v0.22.0: poll the agent EOA balance directly from chain. Read-only RPC
  // that never touches the daemon, so it's safe at any moment. There is no
  // sandbox billing reserve to surface for a local gateway daemon, so
  // sandboxBalance() stays null and the statusbar Show gate hides the segment.
  const balancePublicClient = createPublicClient({
    transport: http(NETWORK_RPC[config.network]),
  })
  const refreshBalances = (): void => {
    balancePublicClient
      .getBalance({ address: agentAddress })
      .then(wei => state.setEoaBalance(Number(formatEther(wei))))
      .catch(() => {})
  }
  refreshBalances()
  const balanceTimer = setInterval(refreshBalances, 30_000)

  const handleSubmit = async (text: string): Promise<void> => {
    const trimmed = text.trim()
    if (trimmed.startsWith('/')) {
      const handled = await handleSlash(trimmed)
      if (handled) {
        state.setStatus('idle')
        return
      }
    }
    state.setStatus('thinking')
    state.setTurnStartedAt(Date.now())
    try {
      const r = await client.chat(text)
      state.pushRow({ role: 'assistant', text: r.response })
      state.setStatus('idle')
      if (r.syncTx) {
        state.pushRow({ role: 'system', text: `auto-sync → tx ${r.syncTx}` })
      }
      // v0.22.0: chain ops drained balances; refresh statusline.
      refreshBalances()
    } catch (err) {
      state.pushRow({
        role: 'system',
        text: `chat failed: ${(err as Error).message.slice(0, 300)}`,
      })
      state.setStatus('error')
    } finally {
      state.setActiveAbort(null)
    }
  }

  const handleSlash = async (cmd: string): Promise<boolean> => {
    if (cmd === '/exit' || cmd === '/quit') {
      state.pushRow({ role: 'system', text: 'goodbye.' })
      handleExit()
      return true
    }
    if (cmd === '/sync') {
      state.pushRow({ role: 'system', text: 'flushing memory + activity to Mantle…' })
      try {
        const r = await client.sync()
        if (r.tx) {
          state.pushRow({
            role: 'system',
            text: `synced ${r.slots.join(', ')} → tx ${r.tx}`,
          })
        } else {
          state.pushRow({ role: 'system', text: 'nothing to sync' })
        }
      } catch (e) {
        state.pushRow({
          role: 'system',
          text: `sync error: ${(e as Error).message.slice(0, 200)}`,
        })
      }
      return true
    }
    // v0.21.13: forward bypass commands to the gateway via client.chat() (the
    // gateway's dispatchBypass intercepts before brain.infer) AND optimistically
    // update the local statusline. Pre-fix the gateway updated its own
    // PermissionService but the TUI's hardcoded `approvalsMode: 'off'` never
    // moved, leaving the statusbar stuck at 'off' even after `/perms prompt`.
    if (cmd === '/yolo' || cmd === '/perms' || cmd.startsWith('/perms ')) {
      try {
        const r = await client.chat(cmd)
        state.pushRow({ role: 'assistant', text: r.response })
        // Re-read healthz for ground truth; cheap (~5ms) and immune to brain reply parsing.
        const h = await client.health().catch(() => null)
        const next = h?.permsMode
        if (next) state.setApprovalsMode(next)
      } catch (e) {
        state.pushRow({
          role: 'system',
          text: `${cmd} failed: ${(e as Error).message.slice(0, 200)}`,
        })
      }
      return true
    }
    if (cmd === '/reset') {
      try {
        const r = await client.chat(cmd)
        state.pushRow({ role: 'assistant', text: r.response })
      } catch (e) {
        state.pushRow({
          role: 'system',
          text: `reset failed: ${(e as Error).message.slice(0, 200)}`,
        })
      }
      return true
    }
    if (cmd === '/help') {
      // Local gateway mode flushes memory directly to chain via the daemon.
      state.pushRow({
        role: 'system',
        text: `local gateway-mode slash commands:\n  /sync   force memory + activity flush via local gateway daemon\n  /yolo   toggle approval prompts off/on for this session\n  /perms <mode>  set permission mode (off|prompt|strict); no arg shows current\n  /reset  clear this channel's conversation history\n  /exit   quit (gateway daemon keeps running)\n  /help   this message`,
      })
      return true
    }
    return false
  }

  const handleExit = (): void => {
    eventSignal.abort()
    clearInterval(balanceTimer)
    void eventLoop.then(() => {})
    try {
      renderer.destroy()
    } catch {}
    void operator.close?.()
    process.exit(0)
  }

  await render(
    () => <ChatApp state={state} onSubmit={handleSubmit} onExit={handleExit} />,
    renderer,
  )

  await new Promise<void>(() => {
    // Block forever; only handleExit (via process.exit) escapes.
  })
}
