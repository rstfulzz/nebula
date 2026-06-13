import { defineChain } from 'viem'

/**
 * Mantle Chain mainnet. ChainId 5000.
 * Multicall3 not confirmed deployed; viem will fall back to sequential
 * eth_call when multicall reads are requested.
 */
export const mantleMainnet = defineChain({
  id: 5000,
  name: 'Mantle',
  nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mantle.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MantleScan', url: 'https://mantlescan.xyz' },
  },
})

export const mantleTestnet = defineChain({
  id: 5003,
  name: 'Mantle Sepolia Testnet',
  nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.sepolia.mantle.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Mantle Sepolia Explorer', url: 'https://sepolia.mantlescan.xyz' },
  },
})

export const NEBULA_AGENT_NFT_ADDRESS = '0x9e71d79f06f956d4d2666b5c93dafab721c84721' as const
export const NEBULA_INBOX_ADDRESS = '0xcd92844cc0ec6Be0607B330D4BaCC707339f2589' as const
export const NEBULA_MARKET_ADDRESS = '0x3ebD21f5dd67acDeF199fACF28388627212bA2aB' as const

// SANN naming on Mantle mainnet.
export const SANN_REGISTRY = '0x5dC881dDA4e4a8d312be3544AD13118D1a04Cb17' as const
export const SANN_RESOLVER = '0x6D3B3F99177FB2A5de7F9E928a9BD807bF7b5BAD' as const
export const SANN_TLD_IDENTIFIER =
  449205675366457712613706471770511817162982777845754732038879201565074548n

// Permissionless `<label>.nebula.0g` subname registrar.
// Mirrors packages/core/src/naming/registrar.ts.
export const NEBULA_REGISTRAR_ADDRESS = '0x33d9f4ec2bd7e7cb4e288c3bbc3a76be472fdd98' as const

// Earliest known activity block on mainnet. Set just below the first known
// nebula mint (block 31_560_769 for specter). Mantle RPC caps `eth_getLogs` ranges
// so going wider triggers silent failures; keep the floor tight.
export const NEBULA_FIRST_MINT_BLOCK = 31_500_000n

export const INTELLIGENT_DATA_SLOTS = [
  'memory-index',
  'identity',
  'persona',
  'profile',
  'keystore',
  'activity-log',
] as const

export type IntelligentDataSlot = (typeof INTELLIGENT_DATA_SLOTS)[number]

export function explorerTxUrl(tx: string): string {
  return `https://mantlescan.xyz/tx/${tx}`
}

export function explorerAddrUrl(addr: string): string {
  return `https://mantlescan.xyz/address/${addr}`
}

export function explorerTokenUrl(contract: string, tokenId: bigint | number | string): string {
  return `https://mantlescan.xyz/token/${contract}/${tokenId}`
}
