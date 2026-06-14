'use client'

import { useSiwe } from '@/components/SiweContext'
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { MarkdownView } from './MarkdownView'

type TraceItem = { tool: string; args: unknown; result: unknown }
type Msg = { role: 'user' | 'assistant'; content: string; trace?: TraceItem[] }

const SUGGESTIONS = [
  "What's the best stablecoin yield on Mantle right now?",
  'Show ERC-8004 agent #1 and its reputation',
  'Simulate sending 0.02 MNT — is it within policy?',
  "What's the current gas price on Mantle?",
]

// Conversation survives refreshes via localStorage (per-browser, client-only).
const STORE_KEY = 'nebula.chat.v1'
const STORE_MAX = 60

// Telegram-bot-style template menu. Picking one fills the input (placeholders
// like 0x… stay for the user to complete). Kept aligned to the agent's tools.
const TEMPLATES: { group: string; items: { label: string; prompt: string }[] }[] = [
  {
    group: 'Reads',
    items: [
      { label: 'Gas price', prompt: 'What is the current gas price on Mantle?' },
      { label: 'Top stablecoin yields', prompt: 'Show the top stablecoin yields on Mantle right now, with TVL.' },
      { label: 'Address balance', prompt: 'What is the MNT and USDC balance of 0x0000000000000000000000000000000000000000 ?' },
    ],
  },
  {
    group: 'ERC-8004 identity',
    items: [
      { label: 'Resolve agent #1', prompt: 'Resolve ERC-8004 agent #1 on Mantle and show its reputation.' },
      { label: 'Resolve an agent', prompt: 'Resolve ERC-8004 agent #2 on Mantle and show its owner, agent address and reputation.' },
    ],
  },
  {
    group: 'Treasury',
    items: [
      { label: 'Simulate a transfer', prompt: 'Simulate sending 0.02 MNT to 0x0000000000000000000000000000000000000000 — is it within policy?' },
      { label: 'Send MNT (owner)', prompt: 'Send 0.01 MNT to 0x0000000000000000000000000000000000000000.' },
    ],
  },
]

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const siwe = useSiwe()
  const authed = siwe.status === 'authenticated' ? (siwe.address ?? null) : null
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const skipPersist = useRef(true)
  const prevStatus = useRef(siwe.status)

  function scrollToEnd() {
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }),
    )
  }

  // Restore a saved conversation on mount (after hydration, to avoid SSR mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY)
      const saved = raw ? (JSON.parse(raw) as Msg[]) : null
      if (Array.isArray(saved) && saved.length > 0) {
        setMessages(saved)
        scrollToEnd()
      }
    } catch {}
  }, [])

  // Persist on change (skip the first run so we don't clobber the restore above).
  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false
      return
    }
    try {
      if (messages.length > 0) localStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-STORE_MAX)))
      else localStorage.removeItem(STORE_KEY)
    } catch {}
  }, [messages])

  function newChat() {
    setMessages([])
    setInput('')
    try {
      localStorage.removeItem(STORE_KEY)
    } catch {}
  }

  // Disconnecting the wallet (signing out) clears the conversation, matching the
  // "your session in this tab is cleared" promise. A fresh page load still
  // restores chat (refresh-safe); only an explicit sign-out wipes it.
  useEffect(() => {
    if (prevStatus.current === 'authenticated' && siwe.status === 'unauthenticated') {
      newChat()
    }
    prevStatus.current = siwe.status
  })

  async function send(text: string) {
    const t = text.trim()
    if (!t || busy) return
    const next: Msg[] = [...messages, { role: 'user', content: t }]
    setMessages(next)
    setInput('')
    setBusy(true)
    scrollToEnd()
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
      scrollToEnd()
    }
  }

  const empty = messages.length === 0

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col gap-7 px-5 py-8">
          {empty ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-7 text-center">
              <div className="grid gap-3">
                <h1
                  className="font-display font-light leading-[1.05] tracking-tight text-[var(--color-ink)]"
                  style={{
                    fontSize: 'clamp(30px, 4vw, 46px)',
                    fontVariationSettings: '"opsz" 96, "SOFT" 30, "WONK" 0',
                  }}
                >
                  Prompt nebula.
                </h1>
                <p className="mx-auto max-w-[48ch] text-[14.5px] leading-[1.6] text-[var(--color-ink-2)]">
                  Live on-chain answers on Mantle. Value-moving actions are policy-capped, simulated,
                  and gated to the signed-in owner.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-[var(--color-border)] px-3.5 py-2 text-left font-mono text-[12px] text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, i) => (
                <motion.div
                  // biome-ignore lint/suspicious/noArrayIndexKey: append-only chat log
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={m.role === 'user' ? 'flex flex-col items-end' : 'flex flex-col items-start'}
                >
                  {m.role === 'user' ? (
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--color-paper)] px-4 py-2.5 text-[14.5px] leading-[1.55] text-[var(--color-ink)]">
                      {m.content}
                    </p>
                  ) : (
                    <div className="w-full">
                      <span className="kicker">NEBULA</span>
                      <div className="mt-1.5 text-[14px] leading-[1.6] [&_h2]:text-[18px] [&_h3]:text-[16px] [&_li]:text-[14.5px] [&_li]:text-[var(--color-ink-2)] [&_p]:mb-2 [&_p]:text-[14.5px] [&_p]:leading-[1.65] [&_p]:text-[var(--color-ink-2)]">
                        <MarkdownView content={m.content} />
                      </div>
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
              ))}
              {busy ? (
                <p className="font-mono text-[12px] text-[var(--color-ink-3)]">nebula is thinking…</p>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] bg-[var(--color-cream)]">
        <div className="mx-auto w-full max-w-[760px] px-5 py-4">
          {!empty ? (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={newChat}
                className="font-mono text-[11px] text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
              >
                ↺ New chat
              </button>
            </div>
          ) : null}
          <form
            onSubmit={e => {
              e.preventDefault()
              void send(input)
            }}
            className="flex items-center gap-1.5 rounded-2xl border border-[var(--color-border)] py-2.5 pl-2 pr-4 transition-colors focus-within:border-[var(--color-ink-3)]"
          >
            <TemplateMenu
              onPick={prompt => {
                setInput(prompt)
                requestAnimationFrame(() => inputRef.current?.focus())
              }}
            />
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Prompt nebula…"
              disabled={busy}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-3)]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-full bg-[var(--color-ink)] px-4 py-1.5 text-[13px] text-[var(--color-cream)] transition-opacity disabled:opacity-40"
            >
              Send
            </button>
          </form>
          <p className="mt-2 text-center font-mono text-[11px] text-[var(--color-ink-3)]">
            {authed
              ? `owner ${authed.slice(0, 6)}…${authed.slice(-4)} signed in · transfers enabled (policy-capped + simulated)`
              : 'read-only · connect + sign in (top right) to authorize transfers'}
          </p>
        </div>
      </div>
    </div>
  )
}

function TemplateMenu({ onPick }: { onPick: (prompt: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Question templates"
        aria-expanded={open}
        title="Templates"
        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)]"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2.5 4h11M2.5 8h11M2.5 12h11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close templates"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute bottom-full left-0 z-50 mb-2 max-h-[60vh] w-[300px] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)] p-2 shadow-[0_30px_80px_-30px_rgba(16,15,9,0.45)]">
            {TEMPLATES.map(group => (
              <div key={group.group} className="mb-1 last:mb-0">
                <p className="px-2 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-3)]">
                  {group.group}
                </p>
                {group.items.map(it => (
                  <button
                    key={it.label}
                    type="button"
                    title={it.prompt}
                    onClick={() => {
                      onPick(it.prompt)
                      setOpen(false)
                    }}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-[13px] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-paper)]"
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
