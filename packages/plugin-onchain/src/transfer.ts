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

/** Build the NativeTransferBuilder tx (shared by the signed + web-sign paths). */
function buildTransferTx(fromPub: PublicKey, p: TransferParams) {
  const cfg = casperConfigFromEnv()
  const target = typeof p.to === 'string' ? PublicKey.fromHex(p.to) : p.to
  return new NativeTransferBuilder()
    .from(fromPub)
    .target(target)
    .amount(csprToMotes(p.amountCspr).toString())
    .id(p.id ?? Date.now())
    .chainName(cfg.chainName)
    .payment(p.paymentMotes ?? 100_000_000)
    .build()
}

export async function transferCspr(
  rpc: RpcClient,
  signer: PrivateKey,
  p: TransferParams,
): Promise<TransferResult> {
  const cfg = casperConfigFromEnv()
  const tx = buildTransferTx(signer.publicKey, p)
  tx.sign(signer)
  const res = await rpc.putTransaction(tx)
  const hash = extractHash(res)
  return { hash, explorer: `${cfg.explorer}/transaction/${hash}` }
}

/**
 * Build the same native transfer as {@link transferCspr} but do NOT sign — return
 * the unsigned `tx.toJSON()`. The connected web wallet signs *and* submits it
 * (via CSPR.click), so the CLI never holds a key for this path.
 */
export function buildUnsignedTransfer(fromPub: PublicKey, p: TransferParams): object {
  // toJSON() is typed JsonTypes (object | … | undefined); for a built tx it is
  // always the JSON object the wallet round-trips via Transaction.fromJSON.
  return buildTransferTx(fromPub, p).toJSON() as object
}
