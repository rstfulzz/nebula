export type { AgentIdentity, IdentityProvider } from './types'
export { StubIdentity } from './stub'

export {
  EXPLORER_BASE,
  type NetworkName,
  explorerTxUrl,
  explorerTokenUrl,
} from './deployments'
export { saveKeystoreLocally } from './keystore-blob'

// ERC-8004 (Trustless Agents) identity
export {
  IDENTITY_REGISTRY_ABI,
  NEBULA_IDENTITY_REGISTRY,
  resolveRegistryAddress,
  registerAgent,
  resolveAgentById,
  agentIdByAddress,
  type ResolvedAgent,
} from './erc8004'
export {
  type AgentCard,
  type AgentCardSkill,
  type AgentCardRegistration,
  DEFAULT_AGENT_SKILLS,
  buildAgentCard,
  cardToDataUri,
} from './agent-card'

// ERC-8004 Reputation + Validation registries
export {
  REPUTATION_REGISTRY_ABI,
  VALIDATION_REGISTRY_ABI,
  NEBULA_REPUTATION_REGISTRY,
  NEBULA_VALIDATION_REGISTRY,
  resolveReputationRegistry,
  resolveValidationRegistry,
  giveFeedback,
  getReputation,
  requestValidation,
  respondValidation,
  getValidation,
  type ValidationRecord,
} from './erc8004-trust'
