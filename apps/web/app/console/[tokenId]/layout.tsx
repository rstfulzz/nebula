'use client'

import { useCasperAuthContext } from '@/components/CasperAuthContext'
import { ConnectGate } from '@/components/console/ConnectGate'
import type { ReactNode } from 'react'

export default function AgentDetailLayout({ children }: { children: ReactNode }) {
  const auth = useCasperAuthContext()
  return (
    <div className="mx-auto w-full max-w-[var(--container-wrap)] px-6 pb-32 pt-28 sm:px-8 sm:pt-32">
      {auth.status === 'loading' ? (
        <div className="min-h-[60vh]" aria-hidden />
      ) : auth.status === 'authenticated' ? (
        children
      ) : (
        <div className="grid min-h-[60vh] place-items-center">
          <ConnectGate />
        </div>
      )}
    </div>
  )
}
