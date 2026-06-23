'use client'

import { useAgentWallet } from '@/components/AgentWalletContext'
import { ACTIVE_NETWORK, MOTES_PER_CSPR, explorerAddrUrl } from '@/lib/chain/chain'
import { shortAddress } from '@/lib/format'
import { HttpHandler, PublicKey, PurseIdentifier, RpcClient } from 'casper-js-sdk'
import { useEffect, useState } from 'react'

// Keyless: shows the agent's treasury account + its scoped-execution contract,
// read-only. The browser holds no key — the agent executes server-side, bounded
// on-chain. Nothing here signs.
export function AgentWalletBar() {
  const { agentAddress, moduleAddress, configured } = useAgentWallet()
  const [bal, setBal] = useState<string | null>(null)

  useEffect(() => {
    if (!agentAddress) {
      setBal(null)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const rpc = new RpcClient(new HttpHandler(ACTIVE_NETWORK.rpcUrl))
        // The treasury account is a Casper public key; query its main purse.
        const purse = PurseIdentifier.fromPublicKey(PublicKey.fromHex(agentAddress))
        const result = await rpc.queryLatestBalance(purse)
        const motes = BigInt(result.balance.toString())
        const cspr = Number(motes) / Number(MOTES_PER_CSPR)
        if (alive) setBal(cspr.toString())
      } catch {
        if (alive) setBal(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [agentAddress])

  if (!configured || !agentAddress) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-border)] px-5 py-2 font-mono text-[12px] text-[var(--color-ink-2)]">
      <span className="text-[var(--color-ink-3)]">treasury</span>
      <a
        href={explorerAddrUrl(agentAddress)}
        target="_blank"
        rel="noreferrer"
        className="text-[var(--color-ink)] hover:underline"
      >
        {shortAddress(agentAddress, 6, 4)}
      </a>
      <span className="text-[var(--color-ink-3)]">
        · {bal !== null ? `${Number(bal).toFixed(4)} CSPR` : '…'}
      </span>
      {moduleAddress ? (
        <span className="text-[var(--color-ink-3)]">
          · bounded on-chain ({shortAddress(moduleAddress, 4, 4)}) · keyless
        </span>
      ) : null}
    </div>
  )
}
