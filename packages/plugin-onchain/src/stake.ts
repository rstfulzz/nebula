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

/** Build the NativeDelegateBuilder tx (shared by the signed + web-sign paths). */
function buildDelegateTx(
  fromPub: PublicKey,
  validatorHex: string,
  amountCspr: number | string,
  paymentMotes = 2_500_000_000,
) {
  const cfg = casperConfigFromEnv()
  return new NativeDelegateBuilder()
    .validator(PublicKey.fromHex(validatorHex))
    .from(fromPub) // delegator = .from()
    .amount(csprToMotes(amountCspr).toString())
    .chainName(cfg.chainName)
    .payment(paymentMotes)
    .build()
}

export async function delegate(
  rpc: RpcClient,
  signer: PrivateKey,
  validatorHex: string,
  amountCspr: number | string,
  paymentMotes = 2_500_000_000,
): Promise<string> {
  const tx = buildDelegateTx(signer.publicKey, validatorHex, amountCspr, paymentMotes)
  tx.sign(signer)
  return extractHash(await rpc.putTransaction(tx))
}

/**
 * Build the same delegate as {@link delegate} but do NOT sign — return the
 * unsigned `tx.toJSON()`. The connected web wallet signs *and* submits it (via
 * CSPR.click), so the CLI never holds a key for this path.
 */
export function buildUnsignedDelegate(
  fromPub: PublicKey,
  validatorHex: string,
  amountCspr: number | string,
): object {
  return buildDelegateTx(fromPub, validatorHex, amountCspr).toJSON() as object
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
