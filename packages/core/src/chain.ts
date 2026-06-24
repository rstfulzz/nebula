import { HttpHandler, RpcClient } from 'casper-js-sdk'
import { NETWORK_CHAIN_NAME, NETWORK_RPC, type NebulaNetwork } from './config'

/**
 * Casper network helpers shared by the harness. Casper is account-based with a
 * native CSPR token (1 CSPR = 1e9 motes); there is no numeric chain id, no gas
 * price in the classic gas sense — deploys carry an explicit payment amount in motes.
 */

export interface CasperChain {
  network: NebulaNetwork
  /** Chain-name string used when signing deploys (`casper` / `casper-test`). */
  chainName: 'casper' | 'casper-test'
  /** CSPR.cloud RPC proxy endpoint. */
  rpcUrl: string
  /** cspr.live explorer base. */
  explorer: string
}

export function casperChain(network: NebulaNetwork): CasperChain {
  const isMainnet = network === 'casper-mainnet'
  return {
    network,
    chainName: NETWORK_CHAIN_NAME[network],
    rpcUrl: NETWORK_RPC[network],
    explorer: isMainnet ? 'https://cspr.live' : 'https://testnet.cspr.live',
  }
}

export function isMainnet(network: NebulaNetwork): boolean {
  return network === 'casper-mainnet'
}

/** A casper-js-sdk RPC client against the network's CSPR.cloud proxy. */
export function makeRpcClient(network: NebulaNetwork): RpcClient {
  return new RpcClient(new HttpHandler(NETWORK_RPC[network]))
}
