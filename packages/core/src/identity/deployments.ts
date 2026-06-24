import { type NebulaNetwork } from '../config'

/** cspr.live explorer base per network. */
export const EXPLORER_BASE: Record<NebulaNetwork, string> = {
  'casper-mainnet': 'https://cspr.live',
  'casper-testnet': 'https://testnet.cspr.live',
}

export type NetworkName = NebulaNetwork

/** cspr.live deploy/transaction link for a Casper deploy hash. */
export function explorerTxUrl(network: NebulaNetwork, deployHash: string): string {
  return `${EXPLORER_BASE[network]}/transaction/${deployHash}`
}

/** cspr.live contract-package link for a CEP-78 token id. */
export function explorerTokenUrl(
  network: NebulaNetwork,
  packageHash: string,
  tokenId: bigint,
): string {
  return `${EXPLORER_BASE[network]}/contract-package/${packageHash}?tokenId=${tokenId}`
}
