/**
 * Casper agent-registries client for the CLI (identity + reputation +
 * validation). Mirrors `apps/web/lib/chain/registries.ts`.
 *
 * Reads come from the Odra registries via casper-js-sdk + a configurable
 * contract package hash from env. The registries are not yet deployed on
 * testnet, so reads gracefully return empty/placeholder data until
 * NEBULA_IDENTITY_PACKAGE_HASH (etc.) are set. The real read path queries the
 * deployed package's dictionaries; until then `resolveAgent` throws a clear
 * "deploy the contracts first (see contracts/DEPLOY.md)" message and the
 * empty-returning reads keep the console rendering cleanly.
 *
 * Writes (register / give-feedback / request-validation / respond) are stubbed
 * with the same "deploy the contracts first" guard so the command structure is
 * intact ahead of the on-chain wiring.
 */
import { HttpHandler, RpcClient } from 'casper-js-sdk'
import { type CasperNetworkConfig, casperConfigFromEnv } from 'nebula-ai-plugin-onchain'

// ─── env-configured Odra registry package hashes ──
export const NEBULA_IDENTITY_PACKAGE_HASH = process.env.NEBULA_IDENTITY_PACKAGE_HASH ?? ''
export const NEBULA_REPUTATION_PACKAGE_HASH = process.env.NEBULA_REPUTATION_PACKAGE_HASH ?? ''
export const NEBULA_VALIDATION_PACKAGE_HASH = process.env.NEBULA_VALIDATION_PACKAGE_HASH ?? ''

export const DEPLOY_FIRST_MESSAGE =
  'Casper agent registries are not deployed yet. Deploy the Odra contracts first ' +
  '(see contracts/DEPLOY.md) and set NEBULA_IDENTITY_PACKAGE_HASH / ' +
  'NEBULA_REPUTATION_PACKAGE_HASH / NEBULA_VALIDATION_PACKAGE_HASH.'

// ─── Casper-native registry shapes ──
export interface AgentCardSkill {
  id: string
  name: string
  description: string
}

export interface AgentCard {
  protocolVersion: string
  name: string
  description: string
  url?: string
  version: string
  /** The agent's operational account (public key hex / account-hash). */
  agentAddress: string
  /** Casper chain name (`casper` / `casper-test`). */
  chainName: string
  capabilities: {
    policyAware: boolean
    preChecks: boolean
    approvals: boolean
    auditable: boolean
  }
  skills: AgentCardSkill[]
  registrations: { agentId: string; registry: string; chainName: string }[]
}

export interface AgentInfo {
  agentId: bigint
  /** Owner account (public key hex / account-hash). */
  owner: string
  /** The agent's operational account (public key hex / account-hash). */
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

export function network(): CasperNetworkConfig {
  return casperConfigFromEnv()
}

/** A casper-js-sdk RPC client against the active network's CSPR.cloud proxy. */
export function rpcClient(): RpcClient {
  const handler = new HttpHandler(network().nodeRpc)
  if (process.env.CSPR_CLOUD_API_KEY) {
    handler.setCustomHeaders({ Authorization: process.env.CSPR_CLOUD_API_KEY })
  }
  return new RpcClient(handler)
}

/** True once the identity registry package hash is configured. */
export function registriesConfigured(): boolean {
  return NEBULA_IDENTITY_PACKAGE_HASH.length > 0
}

/** cspr.live deploy link for a deploy hash. */
export function explorerDeployUrl(deployHash: string): string {
  return `${network().explorer}/deploy/${deployHash}`
}

// ─── Casper agent card (built offline) ──
export const DEFAULT_AGENT_SKILLS: AgentCardSkill[] = [
  {
    id: 'treasury-ops',
    name: 'Policy-aware treasury operations',
    description:
      'Native CSPR transfers and native delegation (staking) on Casper — every write ' +
      'policy-checked, pre-checked, and approval-gated.',
  },
  {
    id: 'risk-analysis',
    name: 'Pre-trade risk + counterparty intel',
    description:
      'Recipient / validator vetting and unified risk analysis before any value-moving action.',
  },
  {
    id: 'agent-trust',
    name: 'Verifiable agent identity / reputation / validation',
    description:
      'On-chain agent identity (CEP-78), reputation, and validation via the Odra registries.',
  },
]

export function buildAgentCard(opts: {
  name: string
  agentAddress: string
  url?: string
  chainName?: string
}): AgentCard {
  return {
    protocolVersion: '0.2.0',
    name: opts.name,
    description: 'Casper-native, policy-aware AI treasury and agent-trust assistant.',
    url: opts.url,
    version: '0.4.0',
    agentAddress: opts.agentAddress,
    chainName: opts.chainName ?? network().chainName,
    capabilities: { policyAware: true, preChecks: true, approvals: true, auditable: true },
    skills: DEFAULT_AGENT_SKILLS,
    registrations: [],
  }
}

/** Encode a card as a `data:application/json;base64,…` URI. */
export function cardToDataUri(card: AgentCard): string {
  const json = JSON.stringify(card)
  const b64 = typeof btoa === 'function' ? btoa(json) : Buffer.from(json, 'utf8').toString('base64')
  return `data:application/json;base64,${b64}`
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

// ─── reads (graceful empty/placeholder until deployed) ──

/**
 * Resolve one agent id → owner, operational account, decoded card.
 *
 * Casper read path (once deployed): query the identity registry package's
 * `agents` dictionary by agent id. Until the package hash is configured this
 * throws the clear "deploy contracts first" message.
 */
export async function resolveAgentById(_agentId: bigint): Promise<AgentInfo> {
  if (!registriesConfigured()) throw new Error(DEPLOY_FIRST_MESSAGE)
  // TODO: dictionary read against NEBULA_IDENTITY_PACKAGE_HASH.
  throw new Error('resolveAgentById: Casper registry read not yet implemented.')
}

/** Reverse-lookup an agent id by its operational account. 0n until deployed. */
export async function agentIdByAddress(_addr: string): Promise<bigint> {
  if (!registriesConfigured()) return 0n
  // TODO: reverse-lookup via the identity registry dictionary.
  return 0n
}

export async function getReputation(_agentId: bigint): Promise<Reputation> {
  if (!registriesConfigured()) return { count: 0n, averageScore: 0n }
  // TODO: dictionary read against the reputation registry package.
  return { count: 0n, averageScore: 0n }
}

export async function getValidation(_requestId: bigint): Promise<ValidationInfo | null> {
  if (!registriesConfigured()) return null
  // TODO: dictionary read against the validation registry package.
  return null
}
