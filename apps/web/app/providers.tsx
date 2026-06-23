'use client'

import { ClickProvider } from '@make-software/csprclick-ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { csprClickOptions } from '@/lib/csprclick'
import { AgentWalletProvider } from '@/components/AgentWalletContext'
import { CasperAuthProvider } from '@/components/CasperAuthContext'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <ClickProvider options={csprClickOptions}>
      <QueryClientProvider client={queryClient}>
        <CasperAuthProvider>
          <AgentWalletProvider>{children}</AgentWalletProvider>
        </CasperAuthProvider>
      </QueryClientProvider>
    </ClickProvider>
  )
}
