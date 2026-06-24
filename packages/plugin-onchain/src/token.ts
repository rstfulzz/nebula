/**
 * CEP-18 fungible-token actions (transfer + balance) via casper-js-sdk. Works
 * against any CEP-18 contract package hash; the agent uses the configured token
 * (NEBULA_TOKEN_PACKAGE_HASH, the NBL test token — 9 decimals).
 */
import {
  Args,
  CLValue,
  ContractCallBuilder,
  Key,
  type PrivateKey,
  PublicKey,
  type RpcClient,
} from 'casper-js-sdk'
import { casperConfigFromEnv } from './config'

export interface TokenTransferParams {
  /** CEP-18 contract package hash (`hash-…`). */
  tokenPackageHash: string
  /** Recipient hex public key. */
  to: string
  /** Raw token units (already scaled by the token's decimals). */
  amount: bigint
  paymentMotes?: number
}

function extractHash(res: unknown): string {
  const r = res as { transactionHash?: { toHex?(): string }; deployHash?: { toHex?(): string } }
  const raw = r?.transactionHash ?? r?.deployHash ?? res
  return (raw as { toHex?(): string })?.toHex?.() ?? String(raw)
}

/** Build the CEP-18 transfer tx (shared by the signed + web-sign paths). */
function buildTokenTransferTx(fromPub: PublicKey, p: TokenTransferParams) {
  const cfg = casperConfigFromEnv()
  const recipient = Key.newKey(PublicKey.fromHex(p.to).accountHash().toPrefixedString())
  return new ContractCallBuilder()
    .from(fromPub)
    .chainName(cfg.chainName)
    .byPackageHash(p.tokenPackageHash.replace(/^hash-/, ''))
    .entryPoint('transfer')
    .runtimeArgs(
      Args.fromMap({
        recipient: CLValue.newCLKey(recipient),
        amount: CLValue.newCLUInt256(p.amount.toString()),
      }),
    )
    .payment(p.paymentMotes ?? 3_000_000_000)
    .build()
}

/** Transfer CEP-18 tokens from the signer to `to`. */
export async function transferToken(
  rpc: RpcClient,
  signer: PrivateKey,
  p: TokenTransferParams,
): Promise<{ hash: string; explorer: string }> {
  const cfg = casperConfigFromEnv()
  const tx = buildTokenTransferTx(signer.publicKey, p)
  tx.sign(signer)
  const submitted = await rpc.putTransaction(tx)
  const hash = extractHash(submitted)
  return { hash, explorer: `${cfg.explorer}/transaction/${hash}` }
}

/**
 * Build the same CEP-18 transfer as {@link transferToken} but do NOT sign —
 * return the unsigned `tx.toJSON()`. The connected web wallet signs *and*
 * submits it (via CSPR.click), so the CLI never holds a key for this path.
 */
export function buildUnsignedTokenTransfer(fromPub: PublicKey, p: TokenTransferParams): object {
  return buildTokenTransferTx(fromPub, p).toJSON() as object
}

/**
 * Read a CEP-18 `balance_of` from the contract's `balances` dictionary.
 * CEP-18 balances live in the contract's `balances` dictionary; reading it on
 * Casper 2.0 needs the entity-state dictionary query (the same surface still
 * pending for the registry reads). Until that's wired, this throws so the tool
 * reports honestly instead of a misleading 0 — balances are on the explorer.
 */
export async function tokenBalanceRaw(
  _rpc: RpcClient,
  _contractHash: string,
  _ownerPublicKeyHex: string,
): Promise<bigint> {
  throw new Error(
    'token balance read pending (Casper 2.0 entity dictionary query) — see testnet.cspr.live',
  )
}
