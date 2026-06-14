import {
  http,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  defineChain,
} from 'viem'
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
import { NETWORK_CHAIN_ID, NETWORK_RPC, type NebulaNetwork } from './config'

/**
 * Static fallback floor when `eth_gasPrice` is unreachable. 4 gwei matches the
 * current Mantle mainnet floor (verified Apr 27 2026). Real callers should prefer
 * `getGasPriceWithFloor` so the value tracks network conditions; this constant
 * is the safety net.
 *
 * History: was 2.5 gwei; bumped to 4 gwei when txs began rejecting with
 * "gas required exceeds allowance" (Geth's misleading wording for min-fee
 * rejection, not OOG).
 */
export const MIN_GAS_PRICE = 4_000_000_000n

/**
 * Read the network's current `eth_gasPrice` and return `max(networkPrice, MIN_GAS_PRICE)`.
 * Falls back to MIN_GAS_PRICE on RPC failure. Always returns a value safe to
 * pass as `maxFeePerGas` / `maxPriorityFeePerGas` for an EIP-1559 tx; the
 * floor protects against a momentarily-low quote, and using the live value
 * means we don't underpay when the network's floor moves up.
 */
export async function getGasPriceWithFloor(client: PublicClient): Promise<bigint> {
  try {
    const price = await client.getGasPrice()
    return price > MIN_GAS_PRICE ? price : MIN_GAS_PRICE
  } catch {
    return MIN_GAS_PRICE
  }
}

/** Empirical gas budget for `Mantle Storage Flow.submit()`. Used by preflight balance checks. */
export const STORAGE_SUBMIT_GAS = 250_000n

export function mantleChain(network: NebulaNetwork): Chain {
  const isMainnet = network === 'mantle-mainnet'
  return defineChain({
    id: NETWORK_CHAIN_ID[network],
    name: isMainnet ? 'Mantle' : 'Mantle Sepolia Testnet',
    nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
    rpcUrls: { default: { http: [NETWORK_RPC[network]] } },
    blockExplorers: {
      default: {
        name: isMainnet ? 'MantleScan' : 'Mantle Sepolia Explorer',
        url: isMainnet ? 'https://mantlescan.xyz' : 'https://sepolia.mantlescan.xyz',
      },
    },
  })
}

export interface ViemClients {
  chain: Chain
  account: PrivateKeyAccount
  publicClient: PublicClient
  walletClient: WalletClient
}

export function makeViemClients(opts: { network: NebulaNetwork; privkeyHex: Hex }): ViemClients {
  const chain = mantleChain(opts.network)
  const account = privateKeyToAccount(opts.privkeyHex)
  const transport = http(NETWORK_RPC[opts.network])
  const publicClient = createPublicClient({ transport, chain })
  const walletClient = createWalletClient({ transport, account, chain })
  return { chain, account, publicClient, walletClient }
}
