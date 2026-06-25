/**
 * Buyer-agent demo for the Nebula x402 paywall. End to end:
 *   1. GET /signal/risk            -> 402 + PaymentRequirements
 *   2. build + sign the payment    -> the Casper `exact` EIP-712 authorization
 *   3. retry with X-PAYMENT        -> 200 + the risk signal + settlement receipt
 *
 * The payer signs only a 32-byte EIP-712 digest; the facilitator submits the
 * on-chain `transfer_with_authorization` and pays the gas. We print the signal,
 * the settlement Casper tx hash, and the payer's CSPRPAY before/after.
 *
 * Env:
 *   X402_PAYER_PEM   path to the funded payer's secret_key.pem (CSPRPAY holder)
 *   X402_PAYER_ALGO  'secp256k1' | 'ed25519' (default secp256k1)
 *   X402_SERVER_URL  default http://localhost:4021
 *   X402_TARGET      address to risk-check (default the deployer pubkey)
 */
import { readFileSync } from 'node:fs'
import { ExactCasperScheme, toClientCasperSigner } from '@make-software/casper-x402'
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk'
import { payTokenBalanceOf } from './balance'
import { NEBULA_PAY_RECIPIENT_PUBKEY, PAY_TOKEN_DECIMALS, nebulaPayTo } from './config'
import type { riskCheckRequirements } from './requirements'
import {
  type PaymentPayload,
  X402_VERSION,
  decodePaymentResponseHeader,
  encodePaymentHeader,
} from './types'

const SERVER_URL = process.env.X402_SERVER_URL ?? 'http://localhost:4021'
const PAYER_PEM = process.env.X402_PAYER_PEM
const PAYER_ALGO = (process.env.X402_PAYER_ALGO ?? 'secp256k1').toLowerCase()
const TARGET = process.env.X402_TARGET ?? NEBULA_PAY_RECIPIENT_PUBKEY

function fmt(atomic: bigint): string {
  return (Number(atomic) / 10 ** PAY_TOKEN_DECIMALS)
    .toFixed(PAY_TOKEN_DECIMALS)
    .replace(/0+$/, '')
    .replace(/\.$/, '')
}

async function main() {
  if (!PAYER_PEM)
    throw new Error('X402_PAYER_PEM is not set (path to the funded payer secret_key.pem)')
  const algo = PAYER_ALGO === 'ed25519' ? KeyAlgorithm.ED25519 : KeyAlgorithm.SECP256K1
  const payerKey = PrivateKey.fromPem(readFileSync(PAYER_PEM, 'utf8'), algo)
  const payerPub = payerKey.publicKey.toHex()
  const payerAccountHash = payerKey.publicKey.accountHash().toHex()
  const signer = toClientCasperSigner(payerKey)
  const scheme = new ExactCasperScheme(signer)

  const resourceUrl = `${SERVER_URL}/signal/risk?address=${encodeURIComponent(TARGET)}`
  console.log('buyer agent   :', payerPub)
  console.log('risk target   :', TARGET)
  console.log('resource      :', resourceUrl)

  const payerBefore = await payTokenBalanceOf(payerAccountHash)
  const nebulaBefore = await payTokenBalanceOf(NEBULA_PAY_RECIPIENT_PUBKEY)
  console.log(`\npayer  CSPRPAY before: ${fmt(payerBefore)}`)
  console.log(`nebula CSPRPAY before: ${fmt(nebulaBefore)}`)

  // 1. Unpaid request -> expect 402 + requirements.
  const first = await fetch(resourceUrl)
  console.log('\n[1] GET (no payment) ->', first.status)
  if (first.status !== 402)
    throw new Error(`expected 402, got ${first.status}: ${await first.text()}`)
  const required = (await first.json()) as { accepts: ReturnType<typeof riskCheckRequirements>[] }
  const requirements = required.accepts[0]
  if (!requirements) throw new Error('402 body had no accepts[0]')
  console.log('    requirements:', JSON.stringify(requirements))

  // 2. Build + sign the Casper `exact` payment payload (proven EIP-712 recipe).
  const built = await scheme.createPaymentPayload(X402_VERSION, requirements as never)
  const builtPayload = (built as unknown as { payload: PaymentPayload['payload'] }).payload
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    accepted: requirements,
    payload: builtPayload,
  }
  console.log('\n[2] signed authorization nonce:', payload.payload.authorization.nonce)

  // 3. Retry with X-PAYMENT -> verify + settle + signal.
  const paid = await fetch(resourceUrl, { headers: { 'X-PAYMENT': encodePaymentHeader(payload) } })
  console.log('\n[3] GET (with X-PAYMENT) ->', paid.status)
  if (paid.status !== 200)
    throw new Error(`payment leg failed (${paid.status}): ${await paid.text()}`)
  const signal = await paid.json()
  const receiptHeader = paid.headers.get('x-payment-response')
  const receipt = receiptHeader
    ? decodePaymentResponseHeader<{ transaction: string; network: string; payer?: string }>(
        receiptHeader,
      )
    : undefined

  console.log('\n=== RISK SIGNAL (paid capability) ===')
  console.log(JSON.stringify(signal, null, 2))
  console.log('\n=== SETTLEMENT RECEIPT (X-PAYMENT-RESPONSE) ===')
  console.log(JSON.stringify(receipt, null, 2))
  if (receipt?.transaction) {
    console.log('settlement tx :', receipt.transaction)
    console.log('explorer      :', `https://testnet.cspr.live/transaction/${receipt.transaction}`)
  }

  // Prove the earn: balances should move by exactly the price (0.5 CSPRPAY).
  console.log('\nwaiting for settlement to finalize before re-reading balances…')
  await new Promise(r => setTimeout(r, 12_000))
  const payerAfter = await payTokenBalanceOf(payerAccountHash)
  const nebulaAfter = await payTokenBalanceOf(NEBULA_PAY_RECIPIENT_PUBKEY)
  console.log(
    `\npayer  CSPRPAY after : ${fmt(payerAfter)}  (delta ${fmt(payerBefore - payerAfter)})`,
  )
  console.log(
    `nebula CSPRPAY after : ${fmt(nebulaAfter)}  (delta +${fmt(nebulaAfter - nebulaBefore)})`,
  )
  console.log('payTo (account-hash):', nebulaPayTo())

  const earned = nebulaAfter - nebulaBefore
  if (earned > 0n) {
    console.log(`\nNEBULA EARNED ${fmt(earned)} CSPRPAY behind the x402 paywall ✅`)
  } else {
    console.log('\nNebula balance did not increase yet — check the explorer tx above.')
  }
}

main().catch(err => {
  console.error('demo failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
