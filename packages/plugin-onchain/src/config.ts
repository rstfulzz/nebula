/**
 * Casper network configuration for the Nebula on-chain plugin.
 *
 * Casper has no numeric chain id (unlike EVM) — networks are identified by a
 * chain-name string (`casper` / `casper-test`). 1 CSPR = 1e9 motes.
 */
export type CasperNetwork = 'casper-mainnet' | 'casper-testnet'

export interface CasperNetworkConfig {
  network: CasperNetwork
  /** Chain name used when signing transactions. */
  chainName: 'casper' | 'casper-test'
  /** JSON-RPC node endpoint (CSPR.cloud proxy by default). */
  nodeRpc: string
  /** Block explorer base URL. */
  explorer: string
}

export const CASPER_NETWORKS: Record<CasperNetwork, CasperNetworkConfig> = {
  'casper-mainnet': {
    network: 'casper-mainnet',
    chainName: 'casper',
    nodeRpc: 'https://node.cspr.cloud/rpc',
    explorer: 'https://cspr.live',
  },
  'casper-testnet': {
    network: 'casper-testnet',
    chainName: 'casper-test',
    nodeRpc: 'https://node.testnet.cspr.cloud/rpc',
    explorer: 'https://testnet.cspr.live',
  },
}

/** Resolve the active network config from env (CASPER_CHAIN_NAME / CASPER_NODE_RPC). */
export function casperConfigFromEnv(): CasperNetworkConfig {
  const chain = process.env.CASPER_CHAIN_NAME ?? 'casper-test'
  const base =
    chain === 'casper' ? CASPER_NETWORKS['casper-mainnet'] : CASPER_NETWORKS['casper-testnet']
  return { ...base, nodeRpc: process.env.CASPER_NODE_RPC ?? base.nodeRpc }
}

export const MOTES_PER_CSPR = 1_000_000_000n

export function csprToMotes(cspr: number | string): bigint {
  // Test-grade precision: fine for whole/decimal CSPR amounts in this range.
  return BigInt(Math.round(Number(cspr) * 1e9))
}

export function motesToCspr(motes: bigint | string): number {
  return Number(BigInt(motes)) / 1e9
}
