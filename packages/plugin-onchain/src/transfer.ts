/**
 * Native CSPR transfer (casper-js-sdk v5 NativeTransferBuilder).
 *
 * Casper enforces a minimum native transfer of 2.5 CSPR. Submit returns a
 * transaction hash; execution is observable once the block finalizes.
 */
import { NativeTransferBuilder, type PrivateKey, PublicKey, type RpcClient } from 'casper-js-sdk'
import { casperConfigFromEnv, csprToMotes } from './config'

export interface TransferParams {
  /** Recipient: hex public key, or a PublicKey. */
  to: string | PublicKey
  /** Amount in CSPR (>= 2.5, the protocol minimum for native transfers). */
  amountCspr: number | string
  /** Gas payment in motes (default 0.1 CSPR). */
  paymentMotes?: number
  /** Optional transfer id. */
  id?: number
}

export interface TransferResult {
  hash: string
  explorer: string
}

function extractHash(res: any): string {
  const raw = res?.transactionHash ?? res?.deployHash ?? res
  return raw?.toHex?.() ?? raw?.hash?.toString?.() ?? raw?.toString?.() ?? String(raw)
}

export async function transferCspr(
  rpc: RpcClient,
  signer: PrivateKey,
  p: TransferParams,
): Promise<TransferResult> {
  const cfg = casperConfigFromEnv()
  const target = typeof p.to === 'string' ? PublicKey.fromHex(p.to) : p.to

  const tx = new NativeTransferBuilder()
    .from(signer.publicKey)
    .target(target)
    .amount(csprToMotes(p.amountCspr).toString())
    .id(p.id ?? Date.now())
    .chainName(cfg.chainName)
    .payment(p.paymentMotes ?? 100_000_000)
    .build()

  tx.sign(signer)
  const res = await rpc.putTransaction(tx)
  const hash = extractHash(res)
  return { hash, explorer: `${cfg.explorer}/transaction/${hash}` }
}
