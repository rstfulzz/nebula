'use client'

import { AGENT_DERIVE_MESSAGE, deriveAgentAccount, deriveAgentPrivateKey } from '@/lib/agent-wallet'
import { useWallet } from '@/lib/use-wallet'
import { useEffect, useState } from 'react'

type State = 'idle' | 'linking' | 'done' | 'error'

export default function TelegramLinkPage() {
  const [code, setCode] = useState<string | null>(null)
  const wallet = useWallet()
  const [state, setState] = useState<State>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [agentAddr, setAgentAddr] = useState<string | null>(null)

  // Read the pairing code client-side (avoids the useSearchParams prerender step).
  useEffect(() => {
    setCode(new URLSearchParams(window.location.search).get('code'))
  }, [])

  async function link() {
    if (!code) return
    setState('linking')
    setErr(null)
    try {
      // Derive the agent key from one signature — identical to web/CLI, so this
      // links the SAME agent. The key is sent once (HTTPS) and sealed server-side.
      const sig = await wallet.signMessage(AGENT_DERIVE_MESSAGE)
      if (!sig) throw new Error('signature was cancelled')
      const { publicKeyHex } = await deriveAgentAccount(sig)
      const agentKey = await deriveAgentPrivateKey(sig)
      const res = await fetch('/api/telegram/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code,
          agentKey,
          agentPublicKey: publicKeyHex,
          ttlHours: 24,
          policyMaxCspr: 1,
        }),
      })
      const data = (await res.json()) as { error?: string; agentPublicKey?: string }
      if (!res.ok) throw new Error(data.error || 'pairing failed')
      setAgentAddr(publicKeyHex)
      setState('done')
    } catch (e) {
      setErr((e as Error).message?.slice(0, 180) ?? 'linking failed')
      setState('error')
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16 text-[var(--color-ink)]">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">nebula · telegram</p>
        <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-3xl">Link your treasury agent</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-ink-2)]">
          Sign once to derive your agent wallet — the same agent you use on the web console and CLI. Telegram
          then acts through a time-limited delegated session you can revoke anytime with <code>/unlink</code>.
        </p>
      </div>

      {!code ? (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)] px-4 py-3 text-[14px] text-[var(--color-ink-2)]">
          Missing pairing code. Open this page from the <code>/link</code> link the bot sent you.
        </p>
      ) : state === 'done' ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)] px-4 py-4">
          <p className="text-[15px]">✅ Telegram linked.</p>
          <p className="mt-1 break-all font-mono text-[12px] text-[var(--color-ink-2)]">agent {agentAddr}</p>
          <p className="mt-3 text-[13px] text-[var(--color-ink-3)]">
            Go back to Telegram and chat with the bot. Fund the agent wallet with CSPR (gas) + assets to manage.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)] px-4 py-3 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
            <span className="font-medium text-[var(--color-ink)]">What you're authorizing:</span> a delegated
            session so the agent can act on Telegram without you signing each time. The key is encrypted at rest,
            expires in 24h, is capped per transaction, and funds-leaving actions still ask you to approve. Only
            fund the agent with what you want it to manage.
          </div>
          {!wallet.connected ? (
            <button
              type="button"
              onClick={() => wallet.signIn()}
              className="self-start rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-[14px] text-[var(--color-cream)]"
            >
              Connect wallet
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void link()}
              disabled={state === 'linking'}
              className="self-start rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-[14px] text-[var(--color-cream)] disabled:opacity-60"
            >
              {state === 'linking' ? 'Sign in your wallet…' : 'Link Telegram to my agent'}
            </button>
          )}
          {err ? <p className="font-mono text-[12px] text-[var(--color-ink-3)]">{err}</p> : null}
        </div>
      )}
    </main>
  )
}
