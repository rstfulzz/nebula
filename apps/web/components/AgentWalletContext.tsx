'use client'

import { AGENT_DERIVE_MESSAGE, deriveAgentAccount } from '@/lib/agent-wallet'
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react'
import type { PrivateKeyAccount } from 'viem/accounts'
import { useAccount, useSignMessage } from 'wagmi'

export type SigningMode = 'agent' | 'main'

interface AgentWalletValue {
  /** The derived agent account (holds the in-memory key), or null until derived. */
  account: PrivateKeyAccount | null
  agentAddress: string | null
  /** Who signs on-chain actions: the derived agent wallet, or the main wallet. */
  mode: SigningMode
  setMode: (m: SigningMode) => void
  /** The address whose balance/positions "my …" refers to (active signer). */
  activeAddress: string | null
  derive: () => Promise<void>
  deriving: boolean
  error: string | null
}

const Ctx = createContext<AgentWalletValue | null>(null)
const MODE_KEY = 'nebula.signing-mode'

export function AgentWalletProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [account, setAccount] = useState<PrivateKeyAccount | null>(null)
  const [mode, setModeState] = useState<SigningMode>('main')
  const [deriving, setDeriving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_KEY)
      if (m === 'agent' || m === 'main') setModeState(m)
    } catch {}
  }, [])

  // Drop the derived wallet if the main wallet changes/disconnects — it must be
  // re-derived from the new wallet's signature.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on address change only
  useEffect(() => {
    setAccount(null)
  }, [address])

  function setMode(m: SigningMode) {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {}
  }

  async function derive() {
    if (!address) {
      setError('Connect your wallet first.')
      return
    }
    setDeriving(true)
    setError(null)
    try {
      const sig = await signMessageAsync({ message: AGENT_DERIVE_MESSAGE })
      setAccount(deriveAgentAccount(sig))
    } catch (e) {
      setError((e as Error).message?.slice(0, 120) ?? 'derivation failed')
    } finally {
      setDeriving(false)
    }
  }

  const effectiveMode: SigningMode = mode === 'agent' && account ? 'agent' : 'main'
  const activeAddress = effectiveMode === 'agent' ? (account?.address ?? null) : (address ?? null)

  return (
    <Ctx.Provider
      value={{
        account,
        agentAddress: account?.address ?? null,
        mode: effectiveMode,
        setMode,
        activeAddress,
        derive,
        deriving,
        error,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAgentWallet(): AgentWalletValue {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAgentWallet must be used within AgentWalletProvider')
  return c
}
