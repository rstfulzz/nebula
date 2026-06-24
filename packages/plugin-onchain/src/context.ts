/**
 * Casper on-chain runtime context — built once by the host (CLI/gateway/web) and
 * handed to every tool.
 */
import { type PrivateKey, PublicKey, type RpcClient } from 'casper-js-sdk'
import { loadSigner, makeRpc } from './client'
import { type CasperNetworkConfig, casperConfigFromEnv } from './config'
import { type OnchainPolicy, policyFromEnv } from './policy'

export interface CasperOnchainContext {
  rpc: RpcClient
  /** Agent signer (undefined => read-only context). */
  signer?: PrivateKey
  /** Agent public key (from the signer, or CASPER_PUBLIC_KEY for read-only). */
  pub?: PublicKey
  network: CasperNetworkConfig
  /** Deterministic fund-control policy; when set, every write is checked first. */
  policy?: OnchainPolicy
  /**
   * Web signer — when set and there's no local `signer`, writes route an
   * UNSIGNED tx JSON to a connected wallet (browser) which signs *and* submits,
   * returning the resulting hash. The CLI then verifies it on-chain.
   */
  webSign?: (unsignedTxJson: object, fromPublicKeyHex: string) => Promise<{ hash: string }>
  agentDir: string
}

export function buildCasperOnchainFromEnv(opts?: {
  agentDir?: string
  policy?: OnchainPolicy
  webSign?: (unsignedTxJson: object, fromPublicKeyHex: string) => Promise<{ hash: string }>
}): CasperOnchainContext {
  let signer: PrivateKey | undefined
  try {
    signer = loadSigner()
  } catch {
    signer = undefined
  }
  let pub = signer?.publicKey
  if (!pub && process.env.CASPER_PUBLIC_KEY) {
    try {
      pub = PublicKey.fromHex(process.env.CASPER_PUBLIC_KEY)
    } catch {}
  }
  return {
    rpc: makeRpc(),
    signer,
    pub,
    network: casperConfigFromEnv(),
    policy: opts?.policy ?? policyFromEnv(),
    webSign: opts?.webSign,
    agentDir: opts?.agentDir ?? process.cwd(),
  }
}
