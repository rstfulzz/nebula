'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  "What's the best stablecoin yield on Mantle right now?",
  'Show ERC-8004 agent #1 and its reputation',
  "What's the current gas price on Mantle?",
]

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
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
      const data = (await res.json()) as { reply?: string; error?: string }
      setMessages([...next, { role: 'assistant', content: data.reply ?? data.error ?? '(no reply)' }])
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
              className={m.role === 'user' ? 'justify-self-end text-right' : 'justify-self-start'}
            >
              <span className="kicker">{m.role === 'user' ? 'YOU' : 'NEBULA'}</span>
              <p
                className={`mt-1 max-w-[68ch] whitespace-pre-wrap text-[14.5px] leading-[1.6] ${
                  m.role === 'user' ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-2)]'
                }`}
              >
                {m.content}
              </p>
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
    </div>
  )
}
