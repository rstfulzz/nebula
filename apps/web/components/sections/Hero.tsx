'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { HeroCanvas } from './HeroCanvas'
import Lightfall from './hero/LightfallBg'

const lineVariants = {
  hidden: { opacity: 0, y: 26, filter: 'blur(8px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

const SWAP_WORDS = ['policy-aware', 'auditable'] as const
const SWAP_INTERVAL_MS = 2800

export function Hero() {
  const reduceMotion = useReducedMotion()
  const [wordIndex, setWordIndex] = useState(0)

  useEffect(() => {
    if (reduceMotion) return
    const id = window.setInterval(() => {
      setWordIndex(i => (i + 1) % SWAP_WORDS.length)
    }, SWAP_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [reduceMotion])

  const currentWord = SWAP_WORDS[wordIndex] ?? SWAP_WORDS[0]

  return (
    <section
      id="hero"
      className="relative isolate flex flex-col bg-[var(--color-cream)]"
      aria-labelledby="hero-headline"
    >
      <div className="mx-auto flex h-screen w-full max-w-[var(--container-wrap)] flex-col items-center justify-center px-6 text-center sm:px-8">
        <Lightfall
          colors={['#A6C8FF', '#5227FF', '#FF9FFC']}
          backgroundColor="#0A29FF"
          speed={0.5}
          streakCount={2}
          streakWidth={1}
          streakLength={1}
          glow={1}
          density={0.6}
          twinkle={1}
          zoom={3}
          backgroundGlow={0.5}
          opacity={1}
          mouseInteraction
          mouseStrength={0.5}
          mouseRadius={1}
      />
        <motion.h1
          id="hero-headline"
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.14, delayChildren: 0.05 }}
          className="font-display text-[clamp(38px,4.8vw,68px)] font-light leading-[1] tracking-[-0.02em] text-[var(--color-ink)]"
          style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30, "WONK" 0' }}
        >
          <motion.span variants={lineVariants} className="block">
            One Prompt. Any Action.
          </motion.span>
          <motion.span variants={lineVariants} className="block">
            across the Casper ecosystem.
          </motion.span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 flex items-center justify-center sm:mt-8 lg:mt-9 z-20"
        >
          <Link
            href="#run"
            onClick={e => {
              const target = document.getElementById('run')
              if (!target) return
              const lenis = window.__lenis
              if (lenis) {
                e.preventDefault()
                lenis.scrollTo(target, {
                  duration: 2.2,
                  easing: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
                })
              }
            }}
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-8 py-3.5 text-[15px] font-medium tracking-tight text-[var(--color-cream)] shadow-[0_18px_40px_-22px_rgba(16,15,9,0.7)] transition-transform hover:-translate-y-0.5 hover:scale-[1.01] active:scale-[0.99]"
          >
            <span>Getting Started</span>
            <span aria-hidden className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.95, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto mt-8 w-full max-w-[1544px] px-4 pb-12 sm:mt-11 sm:px-8 sm:pb-16 lg:mt-12"
      >
        <HeroCanvas />
      </motion.div>
    </section>
  )
}
