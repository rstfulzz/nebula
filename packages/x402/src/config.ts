/**
 * x402 paywall configuration, resolved from env with Casper-testnet defaults.
 *
 * The paid resource is Nebula's address risk pre-check. Payment is an x402
 * `exact` payment in CSPRPAY (the CEP-3009 PayToken), settled by the hosted
 * `x402-facilitator.cspr.cloud` which submits `transfer_with_authorization`
 * (payer -> Nebula) and pays the gas. The payer pays no gas.
 */
import { PublicKey } from 'casper-js-sdk'

/** CAIP-2 network id used across x402 (scheme `exact`, network `casper:casper-test`). */
export const NETWORK_TESTNET = 'casper:casper-test'

/** Hosted facilitator base URL (verify / settle / supported / health). */
export const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ?? 'https://x402-facilitator.cspr.cloud'

/** CSPR.cloud REST base for indexed reads (account balance, activity). */
export const CSPR_CLOUD_REST = process.env.CSPR_CLOUD_REST_URL ?? 'https://api.testnet.cspr.cloud'

/** CSPR.cloud RPC proxy (for the contract dictionary read that proves balances). */
export const CASPER_NODE_RPC = process.env.CASPER_NODE_RPC ?? 'https://node.testnet.cspr.cloud/rpc'

/** CSPR.cloud API key — authorizes both the REST reads and the facilitator. */
export const CSPR_CLOUD_API_KEY = process.env.CSPR_CLOUD_API_KEY ?? ''

/**
 * The CEP-3009 PayToken (CSPRPAY) contract **package** hash, hex (no `hash-`
 * prefix). x402 `asset` must be the 64-char package hash.
 */
export const PAY_TOKEN_PACKAGE_HASH = (
  process.env.NEBULA_PAY_TOKEN_PACKAGE_HASH ??
  'hash-cf8bb7a60813f18fe35dcbef3c1e4442abc040694e098bfb0576b8970b44ac48'
).replace(/^hash-/, '')

/** PayToken decimals (CSPRPAY is 9, like CSPR). */
export const PAY_TOKEN_DECIMALS = 9

/** EIP-712 domain name/version for the PayToken (read back from the contract). */
export const PAY_TOKEN_NAME = process.env.NEBULA_PAY_TOKEN_NAME ?? 'Casper Pay Token'
export const PAY_TOKEN_VERSION = process.env.NEBULA_PAY_TOKEN_VERSION ?? '1'

/** Nebula's payout public key. payTo (account-hash) is derived from it. */
export const NEBULA_PAY_RECIPIENT_PUBKEY =
  process.env.NEBULA_PAY_RECIPIENT_PUBKEY ??
  '0203dc4a23af775ed29fc045565256c35b3519cc9bad1b7e7051172ce2cffc61cc45'

/** Price of one risk check: 0.5 CSPRPAY = 500_000_000 atomic units (9 decimals). */
export const PRICE_ATOMIC = process.env.X402_PRICE_ATOMIC ?? '500000000'

/** Resource server listen port. */
export const SERVER_PORT = Number(process.env.X402_PORT ?? '4021')

/**
 * The account-hash address (66-hex, `00` + account_hash) for an x402 `payTo` /
 * `from` field, derived from a Casper public-key hex. This is exactly the form
 * `@make-software/casper-x402`'s client signer emits (`accountAddress()`).
 */
export function accountAddressFromPublicKey(publicKeyHex: string): string {
  return `00${PublicKey.fromHex(publicKeyHex).accountHash().toHex()}`
}

/** Nebula's payTo, as the 66-hex account-hash address x402 expects. */
export function nebulaPayTo(): string {
  return accountAddressFromPublicKey(NEBULA_PAY_RECIPIENT_PUBKEY)
}
