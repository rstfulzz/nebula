// Agent identity (CEP-78 token) describer for Casper.
//
// On Casper the agent identity is a CEP-78 NFT registered in the Nebula identity
// registry. This module describes an agent's identity via the registries client
// and provides clear "deploy contracts first" paths for mint/transfer until the
// CEP-78 package + registries are live on testnet.

import {
  type AgentInfo,
  registriesConfigured,
  resolveAgent,
} from './registries'
import { INTELLIGENT_DATA_SLOTS, type IntelligentDataSlot } from './chain'

export type SlotEntry = {
  name: IntelligentDataSlot
  /** Content anchor (blake2b hash hex) stored for this slot, or '' if unset. */
  hash: string
  isBootstrap: boolean
}

export type AgentSummary = {
  tokenId: bigint
  owner: string
  slots: SlotEntry[]
}

/** Bootstrap placeholder check (the CLI writes these during `nebula init`). */
export function isBootstrapPlaceholder(hash: string): boolean {
  return !hash || /^0+$/.test(hash)
}

/** The canonical 6 IntelligentData slots, all empty (until reads are wired). */
export function emptySlots(): SlotEntry[] {
  return INTELLIGENT_DATA_SLOTS.map(name => ({ name, hash: '', isBootstrap: true }))
}

/**
 * Describe one agent identity token via the Casper identity registry.
 * Returns null until the registries are deployed.
 */
export async function describeAgent(tokenId: bigint): Promise<AgentSummary | null> {
  if (!registriesConfigured()) return null
  const info: AgentInfo = await resolveAgent(tokenId)
  return { tokenId, owner: info.owner, slots: emptySlots() }
}

/**
 * Mint a new agent identity token. Deploy the CEP-78 package + identity registry
 * first, then wire this to build/sign a TransactionV1 via CSPR.click.
 */
export async function mintAgentIdentity(): Promise<never> {
  throw new Error(
    'Mint requires the Casper CEP-78 identity contracts — deploy contracts first, then wire CSPR.click signing.',
  )
}

/** Transfer an agent identity token (CEP-78). Deploy contracts first. */
export async function transferAgentIdentity(): Promise<never> {
  throw new Error(
    'Transfer requires the Casper CEP-78 identity contracts — deploy contracts first.',
  )
}
