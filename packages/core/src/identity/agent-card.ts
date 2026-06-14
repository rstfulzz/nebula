/**
 * ERC-8004 / A2A "agent card" — the JSON identity document an agent publishes
 * so other agents and systems can discover what it is, where to reach it, and
 * which on-chain identity backs it. Referenced by the Identity Registry's
 * tokenURI (see erc8004.ts).
 */
import type { Address } from 'viem'
import type { NebulaNetwork } from '../config'
import { NETWORK_CHAIN_ID } from '../config'

export interface AgentCardSkill {
  id: string
  name: string
  description: string
}

export interface AgentCardRegistration {
  agentId: string
  registry: Address
  chainId: number
}

export interface AgentCard {
  /** A2A protocol version this card conforms to. */
  protocolVersion: string
  name: string
  description: string
  /** Service endpoint (optional; e.g. a gateway URL). */
  url?: string
  version: string
  /** The agent's operational EOA — signs + pays gas. */
  agentAddress: Address
  network: NebulaNetwork
  chainId: number
  /** What this agent is built to do well. */
  capabilities: {
    policyAware: boolean
    simulation: boolean
    approvals: boolean
    auditable: boolean
  }
  skills: AgentCardSkill[]
  /** ERC-8004 on-chain identity registrations backing this card. */
  registrations: AgentCardRegistration[]
}

/** Nebula's default skill set — the defensible treasury-operator surface. */
export const DEFAULT_AGENT_SKILLS: AgentCardSkill[] = [
  {
    id: 'treasury-ops',
    name: 'Policy-aware treasury operations',
    description:
      'Transfers, swaps (Agni + Merchant Moe best-execution), wrap/unwrap, and Aave V3 lending on Mantle — every write policy-checked, simulated, and approval-gated.',
  },
  {
    id: 'risk-analysis',
    name: 'Pre-trade risk + counterparty intel',
    description:
      'Token risk vetting (exit/liquidity/restricted-RWA) and Nansen counterparty labels before any value-moving action.',
  },
  {
    id: 'yield-discovery',
    name: 'Yield discovery',
    description:
      'DeFiLlama analytics: Mantle pools ranked by APY/TVL with risk + RWA flags (read-only).',
  },
]

export function buildAgentCard(opts: {
  name: string
  agentAddress: Address
  network: NebulaNetwork
  description?: string
  url?: string
  version?: string
  skills?: AgentCardSkill[]
  registration?: { agentId: bigint; registry: Address }
}): AgentCard {
  const chainId = NETWORK_CHAIN_ID[opts.network]
  return {
    protocolVersion: '0.3.0',
    name: opts.name,
    description:
      opts.description ??
      'A Mantle-native, policy-aware AI treasury assistant. The AI advises; deterministic code enforces the fund controls.',
    url: opts.url,
    version: opts.version ?? '0.1.0',
    agentAddress: opts.agentAddress,
    network: opts.network,
    chainId,
    capabilities: { policyAware: true, simulation: true, approvals: true, auditable: true },
    skills: opts.skills ?? DEFAULT_AGENT_SKILLS,
    registrations: opts.registration
      ? [
          {
            agentId: opts.registration.agentId.toString(),
            registry: opts.registration.registry,
            chainId,
          },
        ]
      : [],
  }
}

/** Encode a card as an on-chain `data:` URI so it can be the tokenURI without external hosting. */
export function cardToDataUri(card: AgentCard): string {
  const json = JSON.stringify(card)
  const b64 = Buffer.from(json, 'utf8').toString('base64')
  return `data:application/json;base64,${b64}`
}
