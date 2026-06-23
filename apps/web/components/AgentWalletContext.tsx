'use client'

// Keyless agent identity (Casper). There is NO key in the browser: the agent is a
// treasury account (its main purse) plus a scoped-execution contract that bounds
// what the server-side agent may do. The web only reads + authors; the SERVER
// (bounded by the on-chain scoped contract + native associated-key thresholds)
// signs and executes. The connected Casper wallet is just the read subject /
// owner-setup signer — its key never leaves it.

import { type ReactNode, createContext, useContext, useMemo } from 'react'
import { useWallet } from '@/lib/use-wallet'

interface AgentWalletValue {
  /** The agent's treasury account (public key / account-hash) — from config. */
  agentAddress: string | null
  /** The scoped-execution contract package hash bounding the agent. */
  moduleAddress: string | null
  /** True when a treasury is configured (keyless execution available server-side). */
  configured: boolean
  /** Subject for "my balance / portfolio" reads — the treasury account when
   *  configured, else the connected wallet's public key. */
  activeAddress: string | null
}

function configuredAgent(): { agentAddress: string | null; moduleAddress: string | null } {
  // Casper treasury account (public key or account-hash-…) + the scoped-execution
  // contract package hash. Both come from public env config.
  const a = process.env.NEXT_PUBLIC_NEBULA_TREASURY_ACCOUNT ?? null
  const m = process.env.NEXT_PUBLIC_NEBULA_TREASURY_SCOPED_CONTRACT ?? null
  return { agentAddress: a, moduleAddress: m }
}

const Ctx = createContext<AgentWalletValue | null>(null)

export function AgentWalletProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet()
  const id = useMemo(configuredAgent, [])
  return (
    <Ctx.Provider
      value={{
        agentAddress: id.agentAddress,
        moduleAddress: id.moduleAddress,
        configured: !!id.agentAddress,
        activeAddress: id.agentAddress ?? publicKey ?? null,
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
