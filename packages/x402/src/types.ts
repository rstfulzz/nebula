/**
 * x402 v2 wire types, mirroring `@x402/core` and the Casper `exact` scheme from
 * `@make-software/casper-x402` exactly (so the hosted facilitator accepts them).
 * The `X-PAYMENT` / `X-PAYMENT-RESPONSE` headers are base64(JSON) of these.
 */

/** The x402 protocol version the hosted facilitator speaks. */
export const X402_VERSION = 2

/**
 * `PaymentRequirements` (v2). Note v2 names the price field `amount` (not the v1
 * `maxAmountRequired`) and carries no `resource`/`description` — those live in
 * the surrounding `PaymentRequired.resource`. `extra` must carry the EIP-712
 * domain `{ name, version }` the client needs to rebuild the digest.
 */
export interface PaymentRequirements {
  scheme: 'exact'
  network: string
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  extra: Record<string, unknown>
}

/** CAIP-style resource descriptor returned in a 402 body. */
export interface ResourceInfo {
  url: string
  description?: string
  mimeType?: string
  serviceName?: string
}

/** The HTTP 402 body the resource server returns when payment is required. */
export interface PaymentRequired {
  x402Version: number
  error?: string
  resource: ResourceInfo
  accepts: PaymentRequirements[]
}

/** The Casper `exact` authorization the payer signs (EIP-712 TransferWithAuthorization). */
export interface ExactCasperAuthorization {
  from: string
  to: string
  value: string
  validAfter: string
  validBefore: string
  nonce: string
}

/** The signed payment payload carried (base64) in the `X-PAYMENT` header. */
export interface PaymentPayload {
  x402Version: number
  /** Selected requirements echoed back so the facilitator can match scheme/network. */
  accepted: PaymentRequirements
  payload: {
    signature: string
    publicKey: string
    authorization: ExactCasperAuthorization
  }
}

function b64encode(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf8').toString('base64')
}

function b64decode<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as T
}

/** Encode a payment payload for the `X-PAYMENT` request header. */
export function encodePaymentHeader(payload: PaymentPayload): string {
  return b64encode(payload)
}

/** Decode the `X-PAYMENT` request header into a payment payload. */
export function decodePaymentHeader(header: string): PaymentPayload {
  return b64decode<PaymentPayload>(header)
}

/** Encode the settlement receipt for the `X-PAYMENT-RESPONSE` response header. */
export function encodePaymentResponseHeader(receipt: unknown): string {
  return b64encode(receipt)
}

/** Decode the `X-PAYMENT-RESPONSE` response header. */
export function decodePaymentResponseHeader<T>(header: string): T {
  return b64decode<T>(header)
}
