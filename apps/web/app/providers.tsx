'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { type ReactNode, useEffect, useState } from 'react'
import { AgentWalletProvider } from '@/components/AgentWalletContext'
import { CasperAuthProvider } from '@/components/CasperAuthContext'

// CSPR.click UI can't SSR (its reakit/emotion deps read React-18 internals at
// module load that React 19 / Next 15 don't expose). Load the ClickProvider
// client-only; useWallet reads the bridged ClickRef context, which is null until
// this mounts (the disconnected state), so SSR + first paint render the full page
// without ever importing csprclick-ui on the server.
const CsprClickProvider = dynamic(() => import('@/components/wallet/CsprClickProvider'), {
  ssr: false,
})

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const tree = (
    <QueryClientProvider client={queryClient}>
      <CasperAuthProvider>
        <AgentWalletProvider>{children}</AgentWalletProvider>
      </CasperAuthProvider>
    </QueryClientProvider>
  )

  return mounted ? <CsprClickProvider>{tree}</CsprClickProvider> : tree
}
