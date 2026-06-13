import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { Hero } from '@/components/sections/Hero'
import { V1Opener } from '@/components/sections/section2/V1Opener'

export const metadata = {
  title: 'nebula · first fully on-chain sovereign agent harness on Mantle',
  description:
    'Identity on Mantle Chain, brain on Mantle Compute, memory on Mantle Storage, harness on Mantle Sandbox. Close the laptop, the agent survives.',
}

export default function LandingPage() {
  return (
    <main className="relative min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)]">
      <Navbar />
      <Hero />
      <V1Opener />
      <Footer />
    </main>
  )
}
