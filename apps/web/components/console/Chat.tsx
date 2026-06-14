'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { MarkdownView } from './MarkdownView'

type TraceItem = { tool: string; args: unknown; result: unknown }
type Msg = { role: 'user' | 'assistant'; content: string; trace?: TraceItem[] }

const SUGGESTIONS = [
  "What's the best stablecoin yield on Mantle right now?",
  'Show ERC-8004 agent #1 and its reputation',
  "What's the current gas price on Mantle?",
]

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [authed, setAuthed] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

  // Reflect SIWE sign-in so the user knows whether value-moving actions are enabled.
  useEffect(() => {
    let alive = true
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { address?: string | null }) => {
        if (alive) setAuthed(d.address ?? null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  async function send(text: string) {
    const t = text.trim()
    if (!t || busy) return
    const next: Msg[] = [...messages, { role: 'user', content: t }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = (await res.json()) as { reply?: string; error?: string; trace?: TraceItem[] }
      setMessages([
        ...next,
        { role: 'assistant', content: data.reply ?? data.error ?? '(no reply)', trace: data.trace },
      ])
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `error: ${(e as Error).message}` }])
    } finally {
      setBusy(false)
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }),
      )
    }
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface,transparent)] p-5 sm:p-6">
      <div
        ref={scrollRef}
        className="grid max-h-[44vh] min-h-[120px] gap-4 overflow-y-auto pr-1"
      >
        {messages.length === 0 ? (
          <div className="grid gap-3 py-2">
            <p className="text-[14.5px] leading-[1.6] text-[var(--color-ink-2)]">
              Ask nebula anything about Mantle — it answers with live on-chain data, and
              value-moving actions are policy-capped + simulated before broadcast.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-left font-mono text-[12px] text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <motion.div
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only chat log
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={
                m.role === 'user' ? 'justify-self-end text-right' : 'w-full justify-self-start'
              }
            >
              <span className="kicker">{m.role === 'user' ? 'YOU' : 'NEBULA'}</span>
              {m.role === 'user' ? (
                <p className="mt-1 max-w-[68ch] whitespace-pre-wrap text-[14.5px] leading-[1.6] text-[var(--color-ink)]">
                  {m.content}
                </p>
              ) : (
                <div className="mt-1 max-w-[72ch] text-[14px] leading-[1.6] [&_p]:mb-2 [&_p]:text-[14.5px] [&_p]:leading-[1.6] [&_p]:text-[var(--color-ink-2)] [&_li]:text-[14.5px] [&_h2]:text-[18px] [&_h3]:text-[16px]">
                  <MarkdownView content={m.content} />
                  {m.trace && m.trace.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {m.trace.map((t, ti) => (
                        <span
                          // biome-ignore lint/suspicious/noArrayIndexKey: append-only trace
                          key={ti}
                          title={
                            typeof t.result === 'object'
                              ? JSON.stringify(t.result).slice(0, 300)
                              : String(t.result)
                          }
                          className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--color-ink-3)]"
                        >
                          ⛓ {t.tool}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </motion.div>
          ))
        )}
        {busy ? (
          <p className="font-mono text-[12px] text-[var(--color-ink-3)]">nebula is thinking…</p>
        ) : null}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault()
          void send(input)
        }}
        className="flex items-center gap-2 border-t border-[var(--color-border)] pt-4"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Prompt nebula…"
          disabled={busy}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-3)]"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full bg-[var(--color-ink)] px-4 py-1.5 text-[13px] text-[var(--color-bg,white)] transition-opacity disabled:opacity-40"
        >
          Send
        </button>
      </form>

      <p className="font-mono text-[11px] text-[var(--color-ink-3)]">
        {authed
          ? `owner ${authed.slice(0, 6)}…${authed.slice(-4)} signed in · transfers enabled (policy-capped + simulated)`
          : 'read-only · sign in as the treasury owner below to authorize transfers'}
      </p>
    </div>
  )
}
