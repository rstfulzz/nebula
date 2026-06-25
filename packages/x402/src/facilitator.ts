import { CSPR_CLOUD_API_KEY, FACILITATOR_URL } from './config'
/**
 * Thin client for the hosted Casper x402 facilitator
 * (`x402-facilitator.cspr.cloud`). We call `/verify` and `/settle` with exactly
 * the wire shape `@x402/core`'s `HTTPFacilitatorClient` uses:
 *
 *   POST {url}/verify   body: { x402Version, paymentPayload, paymentRequirements }
 *   POST {url}/settle   body: { x402Version, paymentPayload, paymentRequirements }
 *   GET  {url}/supported
 *
 * All three are authed with the CSPR.cloud API key in the `authorization` header.
 * The facilitator settles `transfer_with_authorization` (payer -> Nebula) and
 * pays the gas itself, so the payer never sends a transaction.
 */
import type { PaymentPayload, PaymentRequirements } from './types'

export interface VerifyResponse {
  isValid: boolean
  invalidReason?: string
  invalidMessage?: string
  payer?: string
}

export interface SettleResponse {
  success: boolean
  errorReason?: string
  errorMessage?: string
  payer?: string
  /** The Casper transaction hash of the settled `transfer_with_authorization`. */
  transaction: string
  network: string
  amount?: string
}

export interface SupportedResponse {
  kinds: Array<{
    x402Version: number
    scheme: string
    network: string
    extra?: Record<string, unknown>
  }>
  extensions: string[]
  signers: Record<string, string[]>
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(CSPR_CLOUD_API_KEY ? { authorization: CSPR_CLOUD_API_KEY } : {}),
  }
}

async function post<T>(
  path: string,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<T> {
  const res = await fetch(`${FACILITATOR_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    redirect: 'follow',
    body: JSON.stringify({
      x402Version: payload.x402Version,
      paymentPayload: payload,
      paymentRequirements: requirements,
    }),
  })
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`facilitator ${path} failed (${res.status}): ${text.slice(0, 400)}`)
  }
  // /verify and /settle return 200 with a structured body even on logical failure;
  // a non-2xx with a structured body still carries the reason, so surface it.
  if (!res.ok && !(data && typeof data === 'object' && ('isValid' in data || 'success' in data))) {
    throw new Error(
      `facilitator ${path} failed (${res.status}): ${JSON.stringify(data).slice(0, 400)}`,
    )
  }
  return data as T
}

export function verify(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<VerifyResponse> {
  return post<VerifyResponse>('/verify', payload, requirements)
}

export function settle(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  return post<SettleResponse>('/settle', payload, requirements)
}

export async function getSupported(): Promise<SupportedResponse> {
  const res = await fetch(`${FACILITATOR_URL}/supported`, { method: 'GET', headers: authHeaders() })
  if (!res.ok)
    throw new Error(
      `facilitator /supported failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    )
  return (await res.json()) as SupportedResponse
}
