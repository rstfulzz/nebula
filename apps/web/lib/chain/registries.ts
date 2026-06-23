// Casper agent-registries client (identity + reputation + validation).
// Reads from the Odra registries via casper-js-sdk + a configurable contract
// package hash from env.
//
// The registries are not yet deployed on testnet, so reads gracefully return
// empty/placeholder data until NEXT_PUBLIC_NEBULA_IDENTITY_PACKAGE_HASH (etc.)
// are set. The real read path uses dictionary queries against the deployed
// package — see resolveAgent / getReputation below.

import { HttpHandler, RpcClient } from 'casper-js-sdk'
import {
  ACTIVE_NETWORK,
  NEBULA_AGENT_IDENTITY_PACKAGE_HASH,
} from './chain'

// ─── types (Casper-native shapes) ──
export interface AgentCard {
  protocolVersion?: string
  name?: string
  description?: string
  url?: string
  version?: string
  agentAddress?: string
  network?: string
  chainName?: string
  capabilities?: Record<string, boolean>
  skills?: { id: string; name: string; description: string }[]
  registrations?: { agentId: string; registry: string; chainName: string }[]
}

export interface AgentInfo {
  agentId: bigint
  /** Owner account (public key / account-hash). */
  owner: string
  /** The agent's operational account (public key / account-hash). */
  agentAddress: string
  cardURI: string
  card: AgentCard | null
}

export interface Reputation {
  count: bigint
  averageScore: bigint
}

export interface ValidationInfo {
  requestId: bigint
  agentId: bigint
  requester: string
  validator: string
  responded: boolean
  passed: boolean
  score: number
  dataHash: string
  requestUri: string
  responseUri: string
}

/** A casper-js-sdk RPC client against the active network's CSPR.cloud proxy. */
export function rpcClient(): RpcClient {
  return new RpcClient(new HttpHandler(ACTIVE_NETWORK.rpcUrl))
}

/** True once the identity registry package hash is configured. */
export function registriesConfigured(): boolean {
  return NEBULA_AGENT_IDENTITY_PACKAGE_HASH.length > 0
}

/** Decode an agent card from a `data:application/json;base64,…` URI (or null). */
export function decodeCard(cardURI: string): AgentCard | null {
  try {
    if (cardURI.startsWith('data:application/json;base64,')) {
      const b64 = cardURI.slice('data:application/json;base64,'.length)
      const json =
        typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8')
      return JSON.parse(json) as AgentCard
    }
    return null
  } catch {
    return null
  }
}

/**
 * Resolve one agent id → owner, operational account, decoded card.
 *
 * Casper read path (once deployed): query the identity registry package's
 * `agents` dictionary by agent id via rpc.getDictionaryItemByIdentifier. Until
 * the package hash is configured this throws a clear "deploy contracts first".
 */
export async function resolveAgent(_agentId: bigint): Promise<AgentInfo> {
  if (!registriesConfigured()) {
    throw new Error(
      'Casper agent registries not deployed yet — set NEXT_PUBLIC_NEBULA_IDENTITY_PACKAGE_HASH.',
    )
  }
  // TODO: dictionary read against NEBULA_AGENT_IDENTITY_PACKAGE_HASH.
  throw new Error('resolveAgent: Casper registry read not yet implemented.')
}

/**
 * Every agent registered to `owner` (most recent first). Returns [] until the
 * registries are deployed so the console renders an empty state cleanly.
 */
export async function getAgentsByOwner(_owner: string): Promise<AgentInfo[]> {
  if (!registriesConfigured()) return []
  // TODO: scan the identity registry (CES events via CSPR.cloud) for this owner.
  return []
}

export async function getReputation(_agentId: bigint): Promise<Reputation> {
  if (!registriesConfigured()) {
    return { count: 0n, averageScore: 0n }
  }
  // TODO: dictionary read against the reputation registry package.
  return { count: 0n, averageScore: 0n }
}

/** All validation requests targeting `agentId`, newest first. */
export async function getValidationsForAgent(_agentId: bigint): Promise<ValidationInfo[]> {
  if (!registriesConfigured()) return []
  // TODO: scan the validation registry (CES events) for this agent.
  return []
}

export async function agentIdByAddress(_addr: string): Promise<bigint> {
  if (!registriesConfigured()) return 0n
  // TODO: reverse-lookup via the identity registry dictionary.
  return 0n
}
