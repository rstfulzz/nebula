'use client'

import { AGENT_DERIVE_MESSAGE, deriveAgentAccount } from '@/lib/agent-wallet'
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react'
import type { PrivateKeyAccount } from 'viem/accounts'
import { useAccount, useSignMessage } from 'wagmi'

interface AgentWalletValue {
  /** The derived agent account (holds the in-memory key), or null until derived. */
  account: PrivateKeyAccount | null
  agentAddress: string | null
  /** Subject for "my balance / portfolio" reads — the connected main wallet. */
  activeAddress: string | null
  derive: () => Promise<void>
  deriving: boolean
  error: string | null
}

const Ctx = createContext<AgentWalletValue | null>(null)

export function AgentWalletProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [account, setAccount] = useState<PrivateKeyAccount | null>(null)
  const [deriving, setDeriving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Drop the derived wallet if the main wallet changes/disconnects — it must be
  // re-derived from the new wallet's signature.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on address change only
  useEffect(() => {
    setAccount(null)
  }, [address])

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

  return (
    <Ctx.Provider
      value={{
        account,
        agentAddress: account?.address ?? null,
        activeAddress: address ?? null,
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
