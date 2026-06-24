'use client'

// Bridges the CSPR.click ref out of the client-only provider so the rest of the
// app (useWallet) never imports `@make-software/csprclick-ui` directly — keeping
// that non-SSR-safe module out of the server bundle. The `import type` below is
// erased at runtime, so this file is SSR-safe.
import type { useClickRef } from '@make-software/csprclick-ui'
import { createContext, useContext } from 'react'

type ClickRef = ReturnType<typeof useClickRef> | null

export const ClickRefContext = createContext<ClickRef>(null)

/** The bridged CSPR.click ref; null during SSR / before the client provider mounts. */
export function useBridgedClickRef(): ClickRef {
  return useContext(ClickRefContext)
}
