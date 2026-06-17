// Telegram bridge webhook — multi-tenant treasury agent over Telegram.
//
// Each Telegram user pairs their own wallet (→ deterministic agent) via the web
// link page; the delegated agent key is sealed in the vault. On each message we
// unseal the key, run the SAME agent (identical to web/CLI), and execute from the
// user's own agent wallet. Low-risk actions auto-execute; funds-leaving actions
// (transfer/bridge) show an Approve button. The bot token never executes anything
// itself — it only relays to per-user delegated sessions.
import { type ChatMessage, executeAction, executeViaTreasury, runAgent, treasuryConfigured } from '@/lib/agent'
import type { PendingAction } from '@/lib/chat-store'
import { approvalKeyboard, tgAnswerCallback, tgConfigured, tgSend } from '@/lib/telegram-api'
import { createPairing, deleteLink, getLink } from '@/lib/telegram-store'
import { open, vaultReady } from '@/lib/vault'
import { randomBytes } from 'node:crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://nebulaai.space'

// Per-chat ephemeral state (lives in the long-running Node process; lost on
// restart, which is fine — history is a convenience and approvals re-ask).
const history = new Map<number, ChatMessage[]>()
const pendingApprovals = new Map<number, PendingAction>()

const ok = () => Response.json({ ok: true })
const txLink = (h: string) => `https://mantlescan.xyz/tx/${h}`

export async function POST(req: Request) {
  // Only Telegram (which echoes the secret set on setWebhook) may post here.
  if (req.headers.get('x-telegram-bot-api-secret-token') !== process.env.NEBULA_TG_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 })
  }
  if (!tgConfigured() || !vaultReady()) return ok() // bridge not provisioned

  let update: {
    message?: { text?: string; chat: { id: number } }
    callback_query?: { id: string; data?: string; message?: { chat: { id: number } } }
  }
  try {
    update = await req.json()
  } catch {
    return ok()
  }

  // --- Inline-button approval for a funds-leaving action ---
  if (update.callback_query) {
    const cb = update.callback_query
    const chatId = cb.message?.chat.id
    await tgAnswerCallback(cb.id)
    if (chatId == null) return ok()
    if (cb.data === 'approve') {
      const pa = pendingApprovals.get(chatId)
      const link = getLink(chatId)
      pendingApprovals.delete(chatId)
      if (!pa || !link) {
        await tgSend(chatId, 'Nothing to approve (it expired). Ask again.')
        return ok()
      }
      try {
        // Keyless treasury mode: execute through the Safe + on-chain module
        // (server signs). Otherwise the per-user delegated key from the vault.
        const ex = treasuryConfigured()
          ? await executeViaTreasury(pa)
          : await executeAction(open(link.sealedKey) as `0x${string}`, pa)
        await tgSend(chatId, `✅ Done: ${pa.label ?? pa.kind}\n[view tx](${txLink(ex.txHash)})`)
      } catch (e) {
        await tgSend(chatId, `⚠️ Execution failed: ${(e as Error).message.slice(0, 160)}`)
      }
    } else {
      pendingApprovals.delete(chatId)
      await tgSend(chatId, 'Cancelled.')
    }
    return ok()
  }

  const msg = update.message
  if (!msg?.text) return ok()
  const chatId = msg.chat.id
  const text = msg.text.trim()

  // --- Commands ---
  if (text === '/start' || text === '/help') {
    await tgSend(
      chatId,
      '*nebula* — your Mantle treasury agent.\n\nThe agent acts from *its own wallet* (derived from your wallet) — same agent you use on the web console and CLI.\n\n• /link — connect your wallet\n• /status — your agent + session\n• /unlink — revoke this session\n\nOnce linked: ask me to check balances, swap, lend on Aave, wrap, or bridge. Funds-leaving actions ask you to approve first.',
    )
    return ok()
  }
  if (text === '/link') {
    const code = randomBytes(6).toString('hex')
    createPairing(chatId, code)
    await tgSend(
      chatId,
      `Open this link to connect your wallet (expires in 10 min):\n${BASE_URL}/telegram/link?code=${code}\n\nYou'll sign once to derive your agent wallet. The session is time-limited and you can /unlink anytime.`,
    )
    return ok()
  }
  if (text === '/unlink') {
    const had = deleteLink(chatId)
    history.delete(chatId)
    pendingApprovals.delete(chatId)
    await tgSend(chatId, had ? 'Session revoked. Your funds are untouched — /link to reconnect.' : 'No active session.')
    return ok()
  }

  const link = getLink(chatId)
  if (!link) {
    await tgSend(chatId, 'Not linked yet. Send /link to connect your wallet.')
    return ok()
  }
  if (text === '/status') {
    const mins = Math.max(0, Math.round((link.expiresAt - Date.now()) / 60000))
    await tgSend(
      chatId,
      `*Agent wallet:* \`${link.agentAddress}\`\n*Session:* expires in ~${mins} min\n*Per-tx cap:* ${link.policyMaxMnt} MNT\n\nFund the agent wallet with MNT (gas) + assets to manage.`,
    )
    return ok()
  }

  // --- Chat → run the agent ---
  // Keyless treasury mode: the server-side agent operates the Safe via the
  // on-chain module (no per-user key needed — pairing is the authorization).
  // Otherwise fall back to the per-user delegated key unsealed from the vault.
  const keyless = treasuryConfigured()
  let key: `0x${string}` | null = null
  if (!keyless) {
    try {
      key = open(link.sealedKey) as `0x${string}`
    } catch {
      deleteLink(chatId)
      await tgSend(chatId, 'Session key could not be opened (vault rotated). Please /link again.')
      return ok()
    }
  }
  const prior = history.get(chatId) ?? []
  const userMsg: ChatMessage = { role: 'user', content: text }
  const messages: ChatMessage[] = [...prior, userMsg].slice(-8)
  let result: Awaited<ReturnType<typeof runAgent>>
  try {
    result = await runAgent(messages, keyless ? { useTreasury: true } : { agentKey: key as `0x${string}` })
  } catch (e) {
    await tgSend(chatId, `error: ${(e as Error).message.slice(0, 160)}`)
    return ok()
  }
  const updated: ChatMessage[] = [...messages, { role: 'assistant', content: result.reply }]
  history.set(chatId, updated.slice(-8))

  if (result.executed) {
    await tgSend(chatId, `${result.reply}\n\n✅ ${result.executed.label ?? result.executed.kind}\n[view tx](${txLink(result.executed.txHash)})`)
  } else if (result.needsApproval && result.pendingAction) {
    pendingApprovals.set(chatId, result.pendingAction)
    await tgSend(chatId, `${result.reply}\n\n*${result.pendingAction.label ?? 'Action'}* — moves funds out of the treasury. Approve?`, approvalKeyboard)
  } else if (result.executeError) {
    await tgSend(chatId, `${result.reply}\n\n⚠️ ${result.executeError}`)
  } else {
    await tgSend(chatId, result.reply)
  }
  return ok()
}
