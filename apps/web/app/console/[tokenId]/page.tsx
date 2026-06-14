'use client'

import { mantleMainnet } from '@/lib/chain/chain'
import {
  type AgentInfo,
  type Reputation,
  type ValidationInfo,
  getReputation,
  getValidationsForAgent,
  resolveAgent,
} from '@/lib/chain/erc8004'
import { shortAddress } from '@/lib/format'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { use as usePromise, useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'

const EXPLORER = 'https://mantlescan.xyz'
const REVEAL_EASE = [0.22, 1, 0.36, 1] as const

export default function AgentDetailPage(props: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = usePromise(props.params)
  const agentId = BigInt(tokenId)
  const client = usePublicClient({ chainId: mantleMainnet.id })

  const [agent, setAgent] = useState<AgentInfo | null>(null)
  const [rep, setRep] = useState<Reputation | null>(null)
  const [vals, setVals] = useState<ValidationInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!client) return
    let alive = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const a = await resolveAgent(client, mantleMainnet.id, agentId)
        if (!alive) return
        setAgent(a)
        const [r, v] = await Promise.all([
          getReputation(client, mantleMainnet.id, agentId).catch(() => null),
          getValidationsForAgent(client, mantleMainnet.id, agentId).catch(() => []),
        ])
        if (!alive) return
        setRep(r)
        setVals(v)
        setLoading(false)
      } catch (e) {
        if (!alive) return
        const msg = (e as Error).message
        setError(msg.includes('unknown agent') ? `No agent with id #${tokenId}.` : msg)
        setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [client, agentId, tokenId])

  if (loading) {
    return <p className="pt-2 text-[14px] text-[var(--color-ink-2)]">Loading agent #{tokenId}…</p>
  }

  if (error || !agent) {
    return (
      <div className="grid gap-3 pt-2">
        <BackLink />
        <p className="text-[15.5px] leading-[1.6] text-[var(--color-ink-2)]">
          {error ?? 'Agent not found.'}
        </p>
      </div>
    )
  }

  const card = agent.card
  const name = card?.name ?? `Agent #${tokenId}`
  const caps = card?.capabilities ? Object.entries(card.capabilities).filter(([, v]) => v) : []

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, filter: 'blur(5px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.7, ease: REVEAL_EASE }}
      className="grid gap-12 pt-2"
    >
      <header className="grid gap-3">
        <BackLink />
        <h1
          className="font-display font-light leading-[1.04] tracking-tight text-[var(--color-ink)]"
          style={{
            fontSize: 'clamp(30px, 3.6vw, 52px)',
            fontVariationSettings: '"opsz" 80, "SOFT" 30, "WONK" 0',
          }}
        >
          {name}
        </h1>
        {card?.description ? (
          <p className="max-w-[62ch] text-[15.5px] leading-[1.6] text-[var(--color-ink-2)]">
            {card.description}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 font-mono text-[12.5px] text-[var(--color-ink-3)]">
          <span>
            id <span className="text-[var(--color-ink)]">#{agent.agentId.toString()}</span>
          </span>
          <a
            href={`${EXPLORER}/address/${agent.agentAddress}`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[var(--color-ink)]"
          >
            agent {shortAddress(agent.agentAddress, 8, 6)} ↗
          </a>
          <a
            href={`${EXPLORER}/address/${agent.owner}`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[var(--color-ink)]"
          >
            owner {shortAddress(agent.owner, 8, 6)} ↗
          </a>
        </div>
      </header>

      {caps.length > 0 ? (
        <section className="grid gap-3">
          <span className="kicker">CAPABILITIES</span>
          <div className="flex flex-wrap gap-2">
            {caps.map(([k]) => (
              <span
                key={k}
                className="rounded-full border border-[var(--color-border)] px-3 py-1 font-mono text-[12px] text-[var(--color-ink-2)]"
              >
                {k}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {card?.skills?.length ? (
        <section className="grid gap-4">
          <span className="kicker">SKILLS</span>
          <ul className="grid gap-5">
            {card.skills.map(s => (
              <li key={s.id} className="grid gap-1">
                <span className="text-[15px] font-medium tracking-tight text-[var(--color-ink)]">
                  {s.name}
                </span>
                <span className="max-w-[62ch] text-[14px] leading-[1.55] text-[var(--color-ink-2)]">
                  {s.description}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-4">
        <span className="kicker">REPUTATION · ERC-8004</span>
        {rep ? (
          <div className="flex flex-wrap items-baseline gap-10">
            <Stat
              value={rep.count > 0n ? rep.averageScore.toString() : '—'}
              label="avg score / 100"
            />
            <Stat value={rep.count.toString()} label={`rating${rep.count === 1n ? '' : 's'}`} />
          </div>
        ) : (
          <p className="text-[14px] text-[var(--color-ink-3)]">No reputation recorded yet.</p>
        )}
      </section>

      <section className="grid gap-4">
        <span className="kicker">VALIDATIONS · ERC-8004</span>
        {vals.length === 0 ? (
          <p className="text-[14px] text-[var(--color-ink-3)]">No validation requests yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {vals.map(v => (
              <li
                key={v.requestId.toString()}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-4"
              >
                <span className="font-mono text-[12px] text-[var(--color-ink-3)]">
                  #{v.requestId.toString()}
                </span>
                <span className="truncate font-mono text-[12px] text-[var(--color-ink-2)]">
                  {v.dataHash.slice(0, 18)}…
                </span>
                <span
                  className={`font-mono text-[12px] ${
                    v.responded
                      ? v.passed
                        ? 'text-[var(--color-ink)]'
                        : 'text-[var(--color-ink-2)]'
                      : 'text-[var(--color-ink-3)]'
                  }`}
                >
                  {v.responded ? `${v.passed ? 'PASS' : 'FAIL'} · ${v.score}` : 'pending'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </motion.div>
  )
}

function BackLink() {
  return (
    <Link
      href="/console"
      className="group w-fit text-[13px] text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
    >
      <span className="inline-block transition-transform group-hover:-translate-x-0.5">←</span> all
      agents
    </Link>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="grid gap-1">
      <span className="font-display text-[40px] font-light leading-none text-[var(--color-ink)]">
        {value}
      </span>
      <span className="font-mono text-[11px] text-[var(--color-ink-3)]">{label}</span>
    </div>
  )
}
