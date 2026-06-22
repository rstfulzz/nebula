/**
 * Native staking (delegate / undelegate) — Casper's "earn" primitive.
 * Minimum delegation is 500 CSPR (protocol-enforced).
 */
import {
  NativeDelegateBuilder,
  NativeUndelegateBuilder,
  type PrivateKey,
  PublicKey,
  type RpcClient,
} from 'casper-js-sdk'
import { casperConfigFromEnv, csprToMotes } from './config'

export const MIN_DELEGATION_CSPR = 500

function extractHash(res: any): string {
  const raw = res?.transactionHash ?? res?.deployHash ?? res
  return raw?.toHex?.() ?? raw?.hash?.toString?.() ?? raw?.toString?.() ?? String(raw)
}

export async function delegate(
  rpc: RpcClient,
  signer: PrivateKey,
  validatorHex: string,
  amountCspr: number | string,
  paymentMotes = 2_500_000_000,
): Promise<string> {
  const cfg = casperConfigFromEnv()
  const tx = new NativeDelegateBuilder()
    .validator(PublicKey.fromHex(validatorHex))
    .from(signer.publicKey) // delegator = .from()
    .amount(csprToMotes(amountCspr).toString())
    .chainName(cfg.chainName)
    .payment(paymentMotes)
    .build()
  tx.sign(signer)
  return extractHash(await rpc.putTransaction(tx))
}

export async function undelegate(
  rpc: RpcClient,
  signer: PrivateKey,
  validatorHex: string,
  amountCspr: number | string,
  paymentMotes = 2_500_000_000,
): Promise<string> {
  const cfg = casperConfigFromEnv()
  const tx = new NativeUndelegateBuilder()
    .validator(PublicKey.fromHex(validatorHex))
    .from(signer.publicKey)
    .amount(csprToMotes(amountCspr).toString())
    .chainName(cfg.chainName)
    .payment(paymentMotes)
    .build()
  tx.sign(signer)
  return extractHash(await rpc.putTransaction(tx))
}
