/**
 * Nebula x402 resource server — the self-funding paywall.
 *
 * `GET /signal/risk?address=<casper pubkey or account-hash>` is the paid Nebula
 * capability (a deterministic address risk pre-check). Without a valid
 * `X-PAYMENT` header it answers **HTTP 402** with `PaymentRequirements`. With one
 * it `/verify`s then `/settle`s through the hosted facilitator, which submits
 * `transfer_with_authorization` (payer -> Nebula) and pays the gas — then it
 * serves the signal plus an `X-PAYMENT-RESPONSE` settlement receipt (the Casper
 * tx hash). Nebula earns CSPRPAY; the buyer pays no gas.
 *
 * Run: `bun packages/x402/src/server.ts`  (default port 4021)
 */
import { SERVER_PORT } from './config'
import { settle, verify } from './facilitator'
import { riskCheckRequirements } from './requirements'
import { riskSignal } from './signal'
import {
  type PaymentPayload,
  type PaymentRequired,
  X402_VERSION,
  decodePaymentHeader,
  encodePaymentResponseHeader,
} from './types'

const RESOURCE_PATH = '/signal/risk'

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

/** The HTTP 402 body: the resource descriptor + the single accepted requirement. */
function paymentRequiredBody(resourceUrl: string): PaymentRequired {
  return {
    x402Version: X402_VERSION,
    error: 'payment required',
    resource: {
      url: resourceUrl,
      description:
        'Nebula address risk pre-check: deterministic 0-100 risk score from live Casper data.',
      mimeType: 'application/json',
      serviceName: 'nebula-risk-signal',
    },
    accepts: [riskCheckRequirements()],
  }
}

async function handleRiskCheck(req: Request, url: URL): Promise<Response> {
  const address = url.searchParams.get('address')
  if (!address) {
    return json({ error: 'missing `address` query parameter' }, 400)
  }

  const requirements = riskCheckRequirements()
  const paymentHeader = req.headers.get('x-payment')

  // --- No payment yet: answer 402 with the requirements. ---
  if (!paymentHeader) {
    return json(paymentRequiredBody(url.toString()), 402)
  }

  // --- Payment present: verify -> settle through the hosted facilitator. ---
  let payload: PaymentPayload
  try {
    const decoded = decodePaymentHeader(paymentHeader)
    // The facilitator matches on `accepted`; echo our requirements onto the payload.
    payload = { ...decoded, accepted: decoded.accepted ?? requirements }
  } catch {
    return json({ error: 'malformed X-PAYMENT header (expected base64 JSON)' }, 400)
  }

  const verifyRes = await verify(payload, requirements)
  if (!verifyRes.isValid) {
    return json(
      {
        error: 'payment_invalid',
        reason: verifyRes.invalidReason,
        message: verifyRes.invalidMessage,
      },
      402,
    )
  }

  const settleRes = await settle(payload, requirements)
  if (!settleRes.success) {
    return json(
      {
        error: 'settlement_failed',
        reason: settleRes.errorReason,
        message: settleRes.errorMessage,
      },
      402,
    )
  }

  // Settled on-chain. Serve the paid signal + the settlement receipt header.
  const signal = await riskSignal(address)
  const receipt = {
    success: true,
    transaction: settleRes.transaction,
    network: settleRes.network,
    payer: settleRes.payer,
    asset: requirements.asset,
    amount: requirements.amount,
    payTo: requirements.payTo,
  }
  return json(signal, 200, { 'X-PAYMENT-RESPONSE': encodePaymentResponseHeader(receipt) })
}

const server = Bun.serve({
  port: SERVER_PORT,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/health') return json({ status: 'ok', service: 'nebula-x402' })
    if (url.pathname === RESOURCE_PATH && req.method === 'GET') {
      try {
        return await handleRiskCheck(req, url)
      } catch (err) {
        return json(
          { error: 'internal_error', message: err instanceof Error ? err.message : String(err) },
          500,
        )
      }
    }
    return json({ error: 'not_found', hint: `GET ${RESOURCE_PATH}?address=<casper address>` }, 404)
  },
})

console.log(`nebula-x402 paywall listening on http://localhost:${server.port}${RESOURCE_PATH}`)
