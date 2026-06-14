/**
 * Mainnet-verified contract addresses for Mantle Aristotle (chain 5000).
 * All four core protocols below were probed live on May 1 2026 with successful
 * txs; see memory `phase-10-design-locked.md` for the cast verifications.
 */

import type { NebulaNetwork } from 'nebula-ai-core'
import type { Address } from 'viem'

/** Multicall3 universal address — same on every EVM chain that has it. */
export const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

/** AGNI protocol contracts (Uniswap V3 softfork on Mantle). */
export interface AgniAddresses {
  factory: Address
  swapRouter: Address
  quoter: Address
  weth9: Address
}

export const AGNI_BY_NETWORK: Record<NebulaNetwork, AgniAddresses | null> = {
  'mantle-mainnet': {
    // Agni Finance (Uniswap V3 fork) on Mantle mainnet. Source: official
    // agni-sdk HomeAddress.ts; factory + swapRouter cross-verified on-chain.
    factory: '0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035',
    swapRouter: '0x319B69888b0d11cEC22caA5034e25FfFBDc88421',
    quoter: '0x9488C05a7b75a6FefdcAE4f11a33467bcBA60177', // QuoterV1 (5-arg quoteExactInputSingle)
    weth9: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8', // WMNT
  },
  'mantle-testnet': null, // Agni not wired for Mantle Sepolia testnet.
}

/** Aave V3 Pool on Mantle. Verified live (getReservesList returns 10 markets). */
export const AAVE_POOL_BY_NETWORK: Record<NebulaNetwork, Address | null> = {
  'mantle-mainnet': '0x458F293454fE0d67EC0655f3672301301DD51422',
  'mantle-testnet': null,
}

/** Merchant Moe Liquidity Book contracts (LFJ/Trader Joe LB fork on Mantle). */
export interface MoeLbAddresses {
  router: Address
  quoter: Address
  factory: Address
}

/**
 * Merchant Moe LB on Mantle mainnet. Source: official docs
 * (docs.merchantmoe.com/resources/contracts); all three cross-verified on-chain
 * (deployed bytecode) + the quoter live-verified (1 WMNT -> 0.55 USDC).
 */
export const MOE_LB_BY_NETWORK: Record<NebulaNetwork, MoeLbAddresses | null> = {
  'mantle-mainnet': {
    router: '0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a',
    quoter: '0x501b8AFd35df20f531fF45F6f695793AC3316c85',
    factory: '0xa6630671775c4EA2743840F9A5016dCf2A104054',
  },
  'mantle-testnet': null,
}

/** AGNI V3 fee tiers in increasing order (1 bp = 0.01%). */
export const FEE_TIERS = [500, 3000, 10000] as const
export type FeeTier = (typeof FEE_TIERS)[number]

/** Default swap deadline: 10 minutes. */
export const DEFAULT_DEADLINE_SECS = 600n

/** Default slippage tolerance (50 bps = 0.5%). */
export const DEFAULT_SLIPPAGE_BPS = 50

/** Block-range chunk size for `eth_getLogs`. 50k chunks safe on Mantle mainnet RPC. */
export const LOG_SCAN_CHUNK_BLOCKS = 50_000n

/** keccak256("Transfer(address,address,uint256)") — ERC-20/721 Transfer topic0. */
export const TRANSFER_TOPIC0 =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const

/** Max chunks per `chain.balance` discovery scan = 1.5M block ceiling. */
export const LOG_SCAN_MAX_CHUNKS = 30

/** EIP-1967 implementation slot for proxy detection. */
export const EIP1967_IMPL_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const

/** ERC-165 interface IDs nebula checks via `chain.contract`. */
export const ERC165_INTERFACES = {
  ERC721: '0x80ac58cd',
  ERC1155: '0xd9b67a26',
  ERC721Metadata: '0x5b5e139f',
  ERC721Enumerable: '0x780e9d63',
} as const

/** Symbols the brain may say in lieu of "native" / address. MNT is Mantle's gas token. */
export const NATIVE_ALIASES = new Set(['MNT', 'mnt', 'native', 'Mantle', 'mantle'])

/** Convenience guard that throws if the network has no AGNI deployment. */
export function requireMainnet(network: NebulaNetwork): asserts network is 'mantle-mainnet' {
  if (network !== 'mantle-mainnet') {
    throw new Error(
      `plugin-onchain currently supports mantle-mainnet only (got ${network}). AGNI isn't deployed on testnet.`,
    )
  }
}
