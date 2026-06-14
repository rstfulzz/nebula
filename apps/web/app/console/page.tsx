'use client'

import { useSiwe } from '@/components/SiweContext'
import { AgentList } from '@/components/console/AgentList'
import { Chat } from '@/components/console/Chat'
import { ConnectGate } from '@/components/console/ConnectGate'
import { motion } from 'framer-motion'

const REVEAL_EASE = [0.22, 1, 0.36, 1] as const

export default function ConsoleHome() {
  const siwe = useSiwe()

  return (
    <div className="mx-auto w-full max-w-[var(--container-wrap)] px-6 pb-32 pt-28 sm:px-8 sm:pt-32">
      <header className="grid gap-3 pb-8">
        <motion.h1
          initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, ease: REVEAL_EASE }}
          className="font-display font-light leading-[1.02] tracking-tight text-[var(--color-ink)]"
          style={{
            fontSize: 'clamp(38px, 4.6vw, 68px)',
            fontVariationSettings: '"opsz" 96, "SOFT" 30, "WONK" 0',
          }}
        >
          Prompt nebula.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: REVEAL_EASE }}
          className="max-w-[58ch] text-[15.5px] leading-[1.6] text-[var(--color-ink-2)]"
        >
          Your Mantle treasury agent, in the browser. It answers with live on-chain data; value-moving
          actions are policy-capped and simulated before broadcast.
        </motion.p>
      </header>

      <Chat />

      <section className="grid gap-5 pt-16">
        <h2
          className="font-display text-[clamp(22px,2.4vw,30px)] font-light tracking-tight text-[var(--color-ink)]"
          style={{ fontVariationSettings: '"opsz" 72, "SOFT" 30, "WONK" 0' }}
        >
          Your agents{' '}
          <span className="font-mono text-[13px] align-middle text-[var(--color-ink-3)]">
            ERC-8004
          </span>
        </h2>
        {siwe.status === 'loading' ? (
          <div className="min-h-[80px]" aria-hidden />
        ) : siwe.status === 'authenticated' ? (
          <AgentList />
        ) : (
          <ConnectGate />
        )}
      </section>
    </div>
  )
}
