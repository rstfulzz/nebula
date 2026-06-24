'use client'

// `nebula connect` (CLI) opens this page with `#port=<port>&sid=<sid>` in the
// URL fragment. The user connects a Casper wallet via CSPR.click, then we POST
// the active public key back to the CLI's localhost server so the terminal can
// store it for read-only chain access.
//
// SSR safety: this page is wrapped by the app's <Providers> (app/layout.tsx),
// which mounts CsprClickProvider client-only via next/dynamic({ ssr: false }).
// We never import @make-software/csprclick-ui here — useWallet only reads the
// bridged ClickRef context (null until that client provider mounts), so the
// page renders fine on the server and during first paint. `window` is touched
// only inside useEffect, never at module/render time.
//
// Web transaction signing is a follow-up: this page only ever hands the CLI a
// public key, never a signed deploy. The seam for signing is here (extend the
// POST payload) and in the CLI server (/cb currently accepts only a public key).

import { useEffect, useState } from 'react'
import { useWallet } from '@/lib/use-wallet'

type Status =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'linked' }
  | { kind: 'error'; message: string }

const PILL_DARK =
  'rounded-full bg-[var(--color-ink)] px-7 py-3.5 text-[15px] font-medium tracking-tight text-[var(--color-cream)] shadow-[0_18px_40px_-22px_rgba(16,15,9,0.7)] transition-transform hover:-translate-y-0.5 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:scale-100'

/** Parse `#port=<port>&sid=<sid>` from the URL fragment. */
function parseHash(hash: string): { port: string | null; sid: string | null } {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return { port: params.get('port'), sid: params.get('sid') }
}

export default function CliConnectPage() {
  const { connected, publicKey, signIn } = useWallet()
  const [target, setTarget] = useState<{ port: string; sid: string } | null>(null)
  const [hashReady, setHashReady] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [posted, setPosted] = useState(false)

  // Read port + sid from the fragment on the client only (guards SSR).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const { port, sid } = parseHash(window.location.hash)
    if (port && sid) setTarget({ port, sid })
    setHashReady(true)
  }, [])

  // Once a wallet is connected and we know where the CLI listens, POST the
  // public key back to its localhost callback. Runs once (guarded by `posted`).
  useEffect(() => {
    if (posted || !connected || !publicKey || !target) return
    setPosted(true)
    setStatus({ kind: 'connecting' })
    void (async () => {
      try {
        const res = await fetch(`http://localhost:${target.port}/cb`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ publicKey, sid: target.sid }),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`callback failed (${res.status})${text ? `: ${text}` : ''}`)
        }
        setStatus({ kind: 'linked' })
      } catch (err) {
        setStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : 'failed to reach the CLI',
        })
        setPosted(false)
      }
    })()
  }, [posted, connected, publicKey, target])

  const missingTarget = hashReady && !target

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[44ch] flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1
          className="font-display font-light leading-[1.05] tracking-tight text-[var(--color-ink)]"
          style={{ fontSize: 'clamp(30px, 4vw, 48px)' }}
        >
          Link your wallet to the CLI
        </h1>
        <p className="mt-3 text-[15.5px] leading-[1.65] text-[var(--color-ink-2)]">
          Connect a Casper wallet to pair it with <span className="font-mono">nebula connect</span>.
          The CLI uses it for read-only chain access — your key never leaves your browser.
        </p>
      </div>

      {missingTarget ? (
        <p className="font-mono text-[12.5px] text-[var(--color-ink-2)]">
          Missing connection details. Start this flow from your terminal with{' '}
          <span className="font-mono">nebula connect</span>.
        </p>
      ) : (
        <div className="grid gap-4">
          <div>
            <button
              type="button"
              onClick={() => signIn()}
              className={PILL_DARK}
              disabled={status.kind === 'connecting'}
            >
              {connected ? 'Switch wallet' : 'Connect wallet'} <span aria-hidden>→</span>
            </button>
          </div>

          {status.kind === 'connecting' ? (
            <p className="font-mono text-[13px] text-[var(--color-ink-2)]">Linking…</p>
          ) : null}
          {status.kind === 'linked' ? (
            <p className="font-mono text-[13px] text-[var(--color-ink)]">
              ✓ wallet linked — return to your terminal.
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
