'use client'

import { useAgentWallet } from '@/components/AgentWalletContext'
import { mantleMainnet } from '@/lib/chain/chain'
import { shortAddress } from '@/lib/format'
import { useEffect, useState } from 'react'
import { formatEther } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'

function pill(active: boolean): string {
  return `rounded-full px-2.5 py-1 text-[11px] transition-colors ${
    active ? 'bg-[var(--color-ink)] text-[var(--color-cream)]' : 'text-[var(--color-ink-2)]'
  }`
}

export function AgentWalletBar() {
  const { isConnected } = useAccount()
  const { account, agentAddress, mode, setMode, derive, deriving, error } = useAgentWallet()
  const client = usePublicClient({ chainId: mantleMainnet.id })
  const [bal, setBal] = useState<string | null>(null)

  useEffect(() => {
    if (!agentAddress || !client) {
      setBal(null)
      return
    }
    let alive = true
    client
      .getBalance({ address: agentAddress as `0x${string}` })
      .then(b => {
        if (alive) setBal(formatEther(b))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [agentAddress, client])

  if (!isConnected) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--color-border)] px-5 py-2">
      {account && agentAddress ? (
        <>
          <div className="flex items-center gap-2 font-mono text-[12px] text-[var(--color-ink-2)]">
            <span className="text-[var(--color-ink-3)]">agent wallet</span>
            <span className="text-[var(--color-ink)]">{shortAddress(agentAddress, 6, 4)}</span>
            <span className="text-[var(--color-ink-3)]">
              · {bal !== null ? `${Number(bal).toFixed(4)} MNT` : '…'}
            </span>
          </div>
          <div className="flex items-center gap-0.5 rounded-full border border-[var(--color-border)] p-0.5">
            <button type="button" onClick={() => setMode('agent')} className={pill(mode === 'agent')}>
              ⚡ Agent signs
            </button>
            <button type="button" onClick={() => setMode('main')} className={pill(mode === 'main')}>
              🖊 My wallet
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[12px] text-[var(--color-ink-2)]">
            Derive your agent wallet — the same one the CLI uses, from a signature.
          </span>
          <button
            type="button"
            onClick={() => void derive()}
            disabled={deriving}
            className="rounded-full bg-[var(--color-ink)] px-3 py-1 text-[12px] text-[var(--color-cream)] transition-opacity disabled:opacity-50"
          >
            {deriving ? 'Sign in your wallet…' : 'Create / load agent wallet'}
          </button>
          {error ? <span className="font-mono text-[11px] text-[var(--color-ink-3)]">{error}</span> : null}
        </div>
      )}
    </div>
  )
}
