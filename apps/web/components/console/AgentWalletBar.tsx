'use client'

import { useAgentWallet } from '@/components/AgentWalletContext'
import { mantleMainnet } from '@/lib/chain/chain'
import { shortAddress } from '@/lib/format'
import { useEffect, useState } from 'react'
import { formatEther } from 'viem'
import { usePublicClient } from 'wagmi'

// Keyless: shows the agent's treasury (a Safe) + its on-chain policy module,
// read-only. The browser holds no key — the agent executes server-side, bounded
// by the module. Nothing here signs.
export function AgentWalletBar() {
  const { agentAddress, moduleAddress, configured } = useAgentWallet()
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

  if (!configured || !agentAddress) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-border)] px-5 py-2 font-mono text-[12px] text-[var(--color-ink-2)]">
      <span className="text-[var(--color-ink-3)]">treasury</span>
      <a
        href={`https://mantlescan.xyz/address/${agentAddress}`}
        target="_blank"
        rel="noreferrer"
        className="text-[var(--color-ink)] hover:underline"
      >
        {shortAddress(agentAddress, 6, 4)}
      </a>
      <span className="text-[var(--color-ink-3)]">· {bal !== null ? `${Number(bal).toFixed(4)} MNT` : '…'}</span>
      {moduleAddress ? (
        <span className="text-[var(--color-ink-3)]">
          · bounded on-chain ({shortAddress(moduleAddress, 4, 4)}) · keyless
        </span>
      ) : null}
    </div>
  )
}
