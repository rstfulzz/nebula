'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useCasperAuth, type CasperAuth } from '@/lib/use-casper-auth'

const CasperAuthContext = createContext<CasperAuth | null>(null)

export function CasperAuthProvider({ children }: { children: ReactNode }) {
  const auth = useCasperAuth()
  return <CasperAuthContext.Provider value={auth}>{children}</CasperAuthContext.Provider>
}

export function useCasperAuthContext(): CasperAuth {
  const ctx = useContext(CasperAuthContext)
  if (!ctx) throw new Error('useCasperAuthContext requires CasperAuthProvider')
  return ctx
}
