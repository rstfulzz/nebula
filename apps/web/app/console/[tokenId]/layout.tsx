'use client'

import { useSiwe } from '@/components/SiweContext'
import { ConnectGate } from '@/components/console/ConnectGate'
import type { ReactNode } from 'react'

export default function AgentDetailLayout({ children }: { children: ReactNode }) {
  const siwe = useSiwe()
  return (
    <div className="mx-auto w-full max-w-[var(--container-wrap)] px-6 pb-32 pt-28 sm:px-8 sm:pt-32">
      {siwe.status === 'loading' ? (
        <div className="min-h-[60vh]" aria-hidden />
      ) : siwe.status === 'authenticated' ? (
        children
      ) : (
        <div className="grid min-h-[60vh] place-items-center">
          <ConnectGate />
        </div>
      )}
    </div>
  )
}
