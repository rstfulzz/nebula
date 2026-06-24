/**
 * Agent identity as seen by the runtime. The on-chain identity is a CEP-78
 * token owned by the operator wallet, registered against the Odra identity
 * registry. The stub fabricates an id from the agent public key so the rest of
 * the runtime can reference identity before the contracts are deployed.
 */
export interface AgentIdentity {
  agentId: string
  identity: {
    /** Identity registry / CEP-78 contract package hash, or null when unregistered. */
    contract: string | null
    /** CEP-78 token id, or null when unregistered. */
    tokenId: string | null
    /** Operator account that owns the identity token (public key hex / account hash). */
    ownerAddress: string
    network: 'casper-mainnet' | 'casper-testnet' | 'local-stub'
  }
  /** The agent's operational account (public key hex). */
  agentAccount: string
  subname?: string
}

export interface IdentityProvider {
  current(): Promise<AgentIdentity>
}
