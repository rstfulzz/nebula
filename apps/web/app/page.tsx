import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { Hero } from '@/components/sections/Hero'
import { X402Hero } from '@/components/sections/X402Hero'
import { V1Opener } from '@/components/sections/section2/V1Opener'

export const metadata = {
  title: 'Nebula AI — an agent that funds its own operations',
  description:
    'Nebula earns behind an x402 paywall and compounds the proceeds into staking — on Casper. The AI advises; deterministic code enforces the fund controls. Every value-moving action runs through policy, simulation, and approval before it broadcasts.',
}

// X402Hero reads live Casper Testnet state (server-only), so the page is dynamic.
export const dynamic = 'force-dynamic'

export default function LandingPage() {
  return (
    <main className="relative min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)]">
      <Navbar />
      <X402Hero />
      <Hero />
      <V1Opener />
      <Footer />
    </main>
  )
}
