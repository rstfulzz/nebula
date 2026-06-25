/**
 * Build the x402 `PaymentRequirements` Nebula emits for the risk-check resource.
 * Shared by the server (the 402 body) and the demo client (so they agree).
 */
import {
  NETWORK_TESTNET,
  PAY_TOKEN_NAME,
  PAY_TOKEN_PACKAGE_HASH,
  PAY_TOKEN_VERSION,
  PRICE_ATOMIC,
  nebulaPayTo,
} from './config'
import type { PaymentRequirements } from './types'

/** Seconds a signed authorization stays valid (also the client's validBefore window). */
export const MAX_TIMEOUT_SECONDS = 300

/** The single `PaymentRequirements` accepted for the risk-check resource. */
export function riskCheckRequirements(): PaymentRequirements {
  return {
    scheme: 'exact',
    network: NETWORK_TESTNET,
    asset: PAY_TOKEN_PACKAGE_HASH,
    amount: PRICE_ATOMIC,
    payTo: nebulaPayTo(),
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    // The Casper `exact` client rebuilds the EIP-712 domain from these.
    extra: { name: PAY_TOKEN_NAME, version: PAY_TOKEN_VERSION },
  }
}
