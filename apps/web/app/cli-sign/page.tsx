'use client'

// `nebula` (CLI) opens this page with `#port=<port>&sid=<sid>` in the URL
// fragment when a write needs signing and no local PEM is set. We fetch the
// UNSIGNED transaction from the CLI's localhost server, sign + submit it via
// CSPR.click (the connected wallet does both), then POST the resulting hash
// back so the terminal can verify it on-chain.
//
// SSR safety mirrors app/cli-connect/page.tsx: this page is wrapped by the
// app's <Providers>, which mounts CsprClickProvider client-only via
// next/dynamic({ ssr: false }). useWallet only reads the bridged ClickRef
// context (null until that client provider mounts), and `window` is touched
// only inside useEffect — so the page renders fine on the server.

import { useEffect, useState } from 'react'
import { useWallet } from '@/lib/use-wallet'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' } // fetching the pending tx from the CLI
  | { kind: 'signing' } // wallet signing + submitting
  | { kind: 'posting' } // posting the hash back to the CLI
  | { kind: 'done'; hash: string }
  | { kind: 'error'; message: string }

const PILL_DARK =
  'rounded-full bg-[var(--color-ink)] px-7 py-3.5 text-[15px] font-medium tracking-tight text-[var(--color-cream)] shadow-[0_18px_40px_-22px_rgba(16,15,9,0.7)] transition-transform hover:-translate-y-0.5 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:scale-100'

/** Parse `#port=<port>&sid=<sid>` from the URL fragment. */
function parseHash(hash: string): { port: string | null; sid: string | null } {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return { port: params.get('port'), sid: params.get('sid') }
}

interface Pending {
  tx: object
  pubkey: string
  sid: string
}

export default function CliSignPage() {
  const { connected, publicKey, signIn, sendTransaction } = useWallet()
  const [target, setTarget] = useState<{ port: string; sid: string } | null>(null)
  const [hashReady, setHashReady] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [started, setStarted] = useState(false)

  // Read port + sid from the fragment on the client only (guards SSR).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const { port, sid } = parseHash(window.location.hash)
    if (port && sid) setTarget({ port, sid })
    setHashReady(true)
  }, [])

  // Once a wallet is connected and we know where the CLI listens: fetch the
  // pending unsigned tx, sign + submit it, then POST the hash back. Runs once.
  useEffect(() => {
    if (started || !connected || !publicKey || !target) return
    setStarted(true)
    void (async () => {
      try {
        setStatus({ kind: 'loading' })
        const pendingRes = await fetch(`http://localhost:${target.port}/pending`)
        if (!pendingRes.ok) throw new Error(`could not load the transaction (${pendingRes.status})`)
        const pending = (await pendingRes.json()) as Pending

        setStatus({ kind: 'signing' })
        const hash = await sendTransaction(pending.tx)
        if (!hash) throw new Error('signing was cancelled or failed')

        setStatus({ kind: 'posting' })
        const cbRes = await fetch(`http://localhost:${target.port}/signed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hash, sid: target.sid }),
        })
        if (!cbRes.ok) {
          const text = await cbRes.text().catch(() => '')
          throw new Error(`callback failed (${cbRes.status})${text ? `: ${text}` : ''}`)
        }
        setStatus({ kind: 'done', hash })
      } catch (err) {
        setStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : 'failed to sign the transaction',
        })
        setStarted(false)
      }
    })()
  }, [started, connected, publicKey, target, sendTransaction])

  const missingTarget = hashReady && !target

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[44ch] flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1
          className="font-display font-light leading-[1.05] tracking-tight text-[var(--color-ink)]"
          style={{ fontSize: 'clamp(30px, 4vw, 48px)' }}
        >
          Approve a transaction
        </h1>
        <p className="mt-3 text-[15.5px] leading-[1.65] text-[var(--color-ink-2)]">
          Your <span className="font-mono">nebula</span> CLI built a transaction and needs your
          connected wallet to sign it. Your key never leaves your browser.
        </p>
      </div>

      {missingTarget ? (
        <p className="font-mono text-[12.5px] text-[var(--color-ink-2)]">
          Missing signing details. This page is opened automatically by the CLI when a write needs
          approval.
        </p>
      ) : (
        <div className="grid gap-4">
          {!connected ? (
            <div>
              <button type="button" onClick={() => signIn()} className={PILL_DARK}>
                Connect wallet <span aria-hidden>→</span>
              </button>
            </div>
          ) : null}

          {status.kind === 'loading' ? (
            <p className="font-mono text-[13px] text-[var(--color-ink-2)]">
              Loading the transaction…
            </p>
          ) : null}
          {status.kind === 'signing' ? (
            <p className="font-mono text-[13px] text-[var(--color-ink-2)]">
              Approve in your wallet…
            </p>
          ) : null}
          {status.kind === 'posting' ? (
            <p className="font-mono text-[13px] text-[var(--color-ink-2)]">Submitting…</p>
          ) : null}
          {status.kind === 'done' ? (
            <p className="break-all font-mono text-[13px] text-[var(--color-ink)]">
              ✓ submitted {status.hash} — return to your terminal.
            </p>
          ) : null}
          {status.kind === 'error' ? (
            <p className="font-mono text-[12.5px] text-[var(--color-ink-2)]">{status.message}</p>
          ) : null}
        </div>
      )}
    </main>
  )
}
