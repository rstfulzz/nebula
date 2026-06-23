// Casper network config for the /console flow.
// 1 CSPR = 1e9 motes (9 decimals), native token CSPR, account-based model.

export type CasperNetwork = {
  /** CSPR.click / casper-js-sdk chain name. */
  chainName: 'casper' | 'casper-test'
  name: string
  nativeCurrency: { name: string; symbol: 'CSPR'; decimals: 9 }
  /** Managed CSPR.cloud RPC proxy. */
  rpcUrl: string
  /** cspr.live explorer base. */
  explorer: string
}

/** Casper mainnet. */
export const casperMainnet: CasperNetwork = {
  chainName: 'casper',
  name: 'Casper',
  nativeCurrency: { name: 'Casper', symbol: 'CSPR', decimals: 9 },
  rpcUrl: 'https://node.cspr.cloud/rpc',
  explorer: 'https://cspr.live',
}

/** Casper testnet (the buildathon target). */
export const casperTestnet: CasperNetwork = {
  chainName: 'casper-test',
  name: 'Casper Testnet',
  nativeCurrency: { name: 'Casper', symbol: 'CSPR', decimals: 9 },
  rpcUrl: 'https://node.testnet.cspr.cloud/rpc',
  explorer: 'https://testnet.cspr.live',
}

/**
 * The network the console reads/writes against. Defaults to testnet for the
 * buildathon; flip via NEXT_PUBLIC_CASPER_NETWORK=mainnet.
 */
export const ACTIVE_NETWORK: CasperNetwork =
  process.env.NEXT_PUBLIC_CASPER_NETWORK === 'mainnet' ? casperMainnet : casperTestnet

/** 1 CSPR = 1e9 motes. */
export const MOTES_PER_CSPR = 1_000_000_000n

// ─── Casper contract package hashes (set once contracts are deployed) ──
// Identity / reputation / validation are Odra registries; the agent identity is
// a CEP-78 token. These are configurable from env with empty-string placeholders
// so the app builds before the contracts are live on testnet.
export const NEBULA_AGENT_IDENTITY_PACKAGE_HASH =
  process.env.NEXT_PUBLIC_NEBULA_IDENTITY_PACKAGE_HASH ?? ''
export const NEBULA_INBOX_PACKAGE_HASH =
  process.env.NEXT_PUBLIC_NEBULA_INBOX_PACKAGE_HASH ?? ''
export const NEBULA_MARKET_PACKAGE_HASH =
  process.env.NEXT_PUBLIC_NEBULA_MARKET_PACKAGE_HASH ?? ''

// Casper naming (CSPR.name). Placeholder package hash from env.
export const CSPR_NAME_PACKAGE_HASH = process.env.NEXT_PUBLIC_CSPR_NAME_PACKAGE_HASH ?? ''

export const INTELLIGENT_DATA_SLOTS = [
  'memory-index',
  'identity',
  'persona',
  'profile',
  'keystore',
  'activity-log',
] as const

export type IntelligentDataSlot = (typeof INTELLIGENT_DATA_SLOTS)[number]

/** cspr.live deploy/transaction link. */
export function explorerTxUrl(deployOrTxHash: string): string {
  return `${ACTIVE_NETWORK.explorer}/deploy/${deployOrTxHash}`
}

/** cspr.live account link (accepts a public key hex or account-hash-…). */
export function explorerAddrUrl(addr: string): string {
  const path = addr.startsWith('account-hash-') ? 'account' : 'account'
  return `${ACTIVE_NETWORK.explorer}/${path}/${addr}`
}

/** cspr.live contract-package link for a CEP-78 token id. */
export function explorerTokenUrl(packageHash: string, tokenId: bigint | number | string): string {
  return `${ACTIVE_NETWORK.explorer}/contract-package/${packageHash}?tokenId=${tokenId}`
}
