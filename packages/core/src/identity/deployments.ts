import type { NebulaNetwork } from '../config'

export const EXPLORER_BASE: Record<NebulaNetwork, string> = {
  'mantle-mainnet': 'https://mantlescan.xyz',
  'mantle-testnet': 'https://sepolia.mantlescan.xyz',
}

export type NetworkName = NebulaNetwork

export function explorerTxUrl(network: NebulaNetwork, txHash: string): string {
  return `${EXPLORER_BASE[network]}/tx/${txHash}`
}

export function explorerTokenUrl(
  network: NebulaNetwork,
  contract: string,
  tokenId: bigint,
): string {
  return `${EXPLORER_BASE[network]}/token/${contract}/${tokenId}`
}
