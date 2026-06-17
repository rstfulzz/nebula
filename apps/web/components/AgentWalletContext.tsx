'use client'

// Keyless agent identity (mirrors sui/new). There is NO derived EOA / private key
// in the browser: the agent is a Safe treasury address + its on-chain
// ScopedAgentModule policy, read from public config. The web only reads + authors;
// the SERVER (bounded by the on-chain module) signs and executes. The connected
// wallet is just the read subject / owner-setup signer — its key never leaves it.

import { type ReactNode, createContext, useContext, useMemo } from 'react'
import { useAccount } from 'wagmi'

interface AgentWalletValue {
  /** The agent's treasury address (the Safe) — the one agent wallet, from config. */
  agentAddress: string | null
  /** The on-chain policy module (ScopedAgentModule) bounding the agent. */
  moduleAddress: string | null
  /** True when a treasury is configured (keyless execution available server-side). */
  configured: boolean
  /** Subject for "my balance / portfolio" reads — the treasury Safe when
   *  configured, else the connected wallet. */
  activeAddress: string | null
}

function configuredAgent(): { agentAddress: string | null; moduleAddress: string | null } {
  const a = process.env.NEXT_PUBLIC_NEBULA_TREASURY_SAFE ?? null
  const m = process.env.NEXT_PUBLIC_NEBULA_TREASURY_MODULE ?? null
  return { agentAddress: a, moduleAddress: m }
}

const Ctx = createContext<AgentWalletValue | null>(null)

export function AgentWalletProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount()
  const id = useMemo(configuredAgent, [])
  return (
    <Ctx.Provider
      value={{
        agentAddress: id.agentAddress,
        moduleAddress: id.moduleAddress,
        configured: !!id.agentAddress,
        activeAddress: id.agentAddress ?? address ?? null,
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
