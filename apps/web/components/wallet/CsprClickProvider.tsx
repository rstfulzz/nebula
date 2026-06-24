'use client'

// The ONLY runtime import of `@make-software/csprclick-ui` in the app. Loaded via
// next/dynamic({ ssr: false }) from app/providers.tsx, so csprclick-ui (which
// reads React-18 internals at module load and can't SSR under Next 15/React 19)
// never enters the server bundle. Wraps children in ClickProvider and bridges the
// ClickRef into a plain context that useWallet reads.
import { ClickProvider, useClickRef } from '@make-software/csprclick-ui'
import type { ReactNode } from 'react'
import { csprClickOptions } from '@/lib/csprclick'
import { ClickRefContext } from '@/lib/wallet-context'

function Bridge({ children }: { children: ReactNode }) {
  const clickRef = useClickRef()
  return <ClickRefContext.Provider value={clickRef}>{children}</ClickRefContext.Provider>
}

export default function CsprClickProvider({ children }: { children: ReactNode }) {
  return (
    <ClickProvider options={csprClickOptions}>
      <Bridge>{children}</Bridge>
    </ClickProvider>
  )
}
