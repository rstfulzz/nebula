/**
 * Casper RPC client + signer + read helpers (casper-js-sdk v5).
 */
import { readFileSync } from 'node:fs'
import {
  HttpHandler,
  KeyAlgorithm,
  PrivateKey,
  PublicKey,
  PurseIdentifier,
  RpcClient,
} from 'casper-js-sdk'
import { casperConfigFromEnv } from './config'

/** Build an RpcClient against the configured node (CSPR.cloud auth header if a key is set). */
export function makeRpc(opts?: { rpcUrl?: string; apiKey?: string }): RpcClient {
  const cfg = casperConfigFromEnv()
  const handler = new HttpHandler(opts?.rpcUrl ?? cfg.nodeRpc)
  const apiKey = opts?.apiKey ?? process.env.CSPR_CLOUD_API_KEY
  // CSPR.cloud node proxy expects the raw access token in the Authorization header.
  if (apiKey) handler.setCustomHeaders({ Authorization: apiKey })
  return new RpcClient(handler)
}

/** Load the agent signer from a PEM file (default secp256k1 — our wallet's algorithm). */
export function loadSigner(opts?: { pemPath?: string; algorithm?: KeyAlgorithm }): PrivateKey {
  const path = opts?.pemPath ?? process.env.CASPER_SECRET_KEY_PATH
  if (!path) throw new Error('CASPER_SECRET_KEY_PATH is not set (no signer available)')
  return PrivateKey.fromPem(readFileSync(path, 'utf8'), opts?.algorithm ?? KeyAlgorithm.SECP256K1)
}

/** Main-purse CSPR balance (in motes) for a public key. */
export async function getBalanceMotes(rpc: RpcClient, pub: PublicKey): Promise<bigint> {
  const res: any = await rpc.queryLatestBalance(PurseIdentifier.fromPublicKey(pub))
  const raw = res?.balance ?? res?.balanceValue ?? res
  return BigInt(raw.toString())
}

export interface ExecStatus {
  executed: boolean
  success: boolean
  errorMessage?: string
  costMotes?: string
}

/**
 * Poll a transaction's on-chain execution result. An empty `errorMessage` means
 * success. Every write tool verifies through this — "Invalid purse"-style
 * failures still consume gas, so a balance delta alone can lie.
 */
export async function waitForExecution(
  rpc: RpcClient,
  hash: string,
  opts?: { tries?: number; intervalMs?: number },
): Promise<ExecStatus> {
  const tries = opts?.tries ?? 24
  const interval = opts?.intervalMs ?? 5000
  const anyRpc = rpc as any
  for (let i = 0; i < tries; i++) {
    await new Promise(r => setTimeout(r, interval))
    try {
      const res = await anyRpc.getTransactionByTransactionHash?.(hash)
      const info = res?.executionInfo ?? res?.execution_info
      const exec = info?.executionResult ?? info?.execution_result
      if (exec) {
        const errorMessage = exec?.errorMessage ?? exec?.error_message ?? undefined
        return {
          executed: true,
          success: !errorMessage,
          errorMessage,
          costMotes: (exec?.cost ?? exec?.consumed)?.toString?.(),
        }
      }
    } catch {}
  }
  return { executed: false, success: false, errorMessage: 'not executed within timeout' }
}

export interface ValidatorInfo {
  publicKey: string
  delegationRate?: number
  stakedMotes?: string
}

/** List current validators (from the auction) — for staking/earn. Best-effort shape parsing. */
export async function getValidators(rpc: RpcClient, limit = 10): Promise<ValidatorInfo[]> {
  const anyRpc = rpc as any
  const info = await (anyRpc.getLatestAuctionInfo?.() ?? anyRpc.getAuctionInfoLatest?.())
  const state = info?.auctionState ?? info?.auction_state ?? info
  const bids: any[] = state?.bids ?? []
  return bids.slice(0, limit).map(b => {
    const pk = b?.publicKey ?? b?.public_key ?? b?.validatorPublicKey
    const bid = b?.bid ?? b
    return {
      publicKey: pk?.toHex?.() ?? String(pk),
      delegationRate: bid?.delegationRate ?? bid?.delegation_rate,
      stakedMotes: (bid?.stakedAmount ?? bid?.staked_amount)?.toString?.(),
    }
  })
}

export { PublicKey, KeyAlgorithm }
