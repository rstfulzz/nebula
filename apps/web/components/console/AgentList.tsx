'use client'

import { useSiwe } from '@/components/SiweContext'
import { mantleMainnet } from '@/lib/chain/chain'
import {
  type AgentInfo,
  type Reputation,
  getAgentsByOwner,
  getReputation,
} from '@/lib/chain/erc8004'
import { shortAddress } from '@/lib/format'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; agents: AgentInfo[]; reps: Map<string, Reputation> }
  | { kind: 'error'; message: string }

const POLL_INTERVAL_MS = 30_000
const REVEAL_EASE = [0.22, 1, 0.36, 1] as const

export function AgentList() {
  const siwe = useSiwe()
  const address = siwe.address
  // Read against Mantle mainnet (where the ERC-8004 registries live).
  const client = usePublicClient({ chainId: mantleMainnet.id })
  const [state, setState] = useState<LoadState>({ kind: 'idle' })

  useEffect(() => {
    if (!address || !client) {
      setState({ kind: 'idle' })
      return
    }
    let alive = true
    let isInitial = true
    setState({ kind: 'loading' })

    async function load() {
      try {
        const agents = await getAgentsByOwner(client!, mantleMainnet.id, address as Address)
        if (!alive) return
        const reps = new Map<string, Reputation>()
        await Promise.all(
          agents.map(async a => {
            const r = await getReputation(client!, mantleMainnet.id, a.agentId).catch(() => null)
            if (r) reps.set(a.agentId.toString(), r)
          }),
        )
        if (!alive) return
        setState({ kind: 'ready', agents, reps })
      } catch (err) {
        if (alive && isInitial) setState({ kind: 'error', message: (err as Error).message })
      } finally {
        isInitial = false
      }
    }

    void load()
    const poll = setInterval(() => {
      if (alive) void load()
    }, POLL_INTERVAL_MS)
    return () => {
      alive = false
      clearInterval(poll)
    }
  }, [address, client])

  if (state.kind === 'idle') return null

  if (state.kind === 'loading') {
    return (
      <p className="text-[14px] leading-[1.55] text-[var(--color-ink-2)]">
        Reading the ERC-8004 Identity Registry for {shortAddress(address ?? '')}…
      </p>
    )
  }

  if (state.kind === 'error') {
    return (
      <p className="text-[14px] leading-[1.55] text-[var(--color-ink-2)]">
        Could not read agents from chain. {state.message}
      </p>
    )
  }

  if (state.agents.length === 0) {
    return (
      <div className="grid gap-5">
        <p className="font-display text-[clamp(26px,2.8vw,38px)] font-light leading-[1.1] tracking-tight text-[var(--color-ink)]">
          No agents on this wallet.{' '}
          <span className="font-italic-serif italic text-[var(--color-ink-2)]">Yet.</span>
        </p>
        <p className="max-w-[46ch] text-[15.5px] leading-[1.65] text-[var(--color-ink-2)]">
          Run <code className="font-mono text-[14px] text-[var(--color-ink)]">nebula init</code>,
          then{' '}
          <code className="font-mono text-[14px] text-[var(--color-ink)]">
            nebula identity register
          </code>{' '}
          to mint an ERC-8004 identity. Then come back.
        </p>
        <Link
          href="/#run"
          className="group inline-flex w-fit items-center gap-1.5 pt-1 text-[13.5px] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
        >
          <span>How to install</span>
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <motion.p
        initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.7, delay: 0.08, ease: REVEAL_EASE }}
        className="text-[13px] text-[var(--color-ink-3)]"
      >
        {state.agents.length} agent{state.agents.length === 1 ? '' : 's'} on the ERC-8004 Identity
        Registry.
      </motion.p>
      <ul className="mt-4 divide-y divide-[var(--color-border)]">
        {state.agents.map((agent, i) => {
          const rep = state.reps.get(agent.agentId.toString())
          const name = agent.card?.name ?? `Agent #${agent.agentId.toString()}`
          return (
            <motion.li
              key={agent.agentId.toString()}
              initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.7, delay: 0.16 + i * 0.05, ease: REVEAL_EASE }}
            >
              <Link
                href={`/console/${agent.agentId.toString()}`}
                className="group grid grid-cols-[1fr_auto] items-center gap-6 py-7 sm:gap-8"
              >
                <div className="grid gap-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span
                      className="font-display text-[20px] font-light tracking-tight text-[var(--color-ink)]"
                      style={{ fontVariationSettings: '"opsz" 60, "SOFT" 30, "WONK" 0' }}
                    >
                      {name}
                    </span>
                    <span className="font-mono text-[11.5px] text-[var(--color-ink-3)]">
                      #{agent.agentId.toString()}
                    </span>
                  </div>
                  <p className="font-mono text-[13.5px] text-[var(--color-ink)]">
                    {shortAddress(agent.agentAddress, 10, 6)}
                  </p>
                  {rep ? (
                    <p className="font-mono text-[12px] text-[var(--color-ink-3)]">
                      <span className="text-[var(--color-ink)]">{rep.count.toString()}</span>{' '}
                      rating{rep.count === 1n ? '' : 's'}
                      {rep.count > 0n ? (
                        <>
                          {' · avg '}
                          <span className="text-[var(--color-ink-2)]">
                            {rep.averageScore.toString()}
                          </span>
                          /100
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <span
                  className="text-[13px] text-[var(--color-ink-2)] transition group-hover:text-[var(--color-ink)]"
                  aria-hidden
                >
                  Open{' '}
                  <span className="inline-block transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </Link>
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}
