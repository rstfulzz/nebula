/**
 * Bybit V5 read-only client — account balance (portfolio view) only.
 *
 * DELIBERATELY READ-ONLY. CEX trading/transfers are out of scope: they execute
 * off-chain and would bypass Nebula's on-chain policy -> simulate -> approval
 * pipeline (the whole safety thesis). This only reads the Unified account
 * balance so the agent can show a CEX + on-chain treasury picture.
 *
 * Auth: V5 HMAC-SHA256. Keys come from the ENVIRONMENT only
 * (BYBIT_API_KEY / BYBIT_API_SECRET) — never committed.
 */

import { createHmac } from 'node:crypto'

export const BYBIT_BASE = 'https://api.bybit.com'
const RECV_WINDOW = '5000'

/**
 * V5 signature: HMAC_SHA256(timestamp + apiKey + recvWindow + payload, secret).
 * For GET, payload is the (already-ordered) query string. Pure + unit-testable.
 */
export function bybitSign(opts: {
  secret: string
  timestamp: string
  apiKey: string
  recvWindow: string
  payload: string
}): string {
  return createHmac('sha256', opts.secret)
    .update(opts.timestamp + opts.apiKey + opts.recvWindow + opts.payload)
    .digest('hex')
}

export interface BybitCoin {
  coin: string
  walletBalance: string
  /** Bybit-reported USD value of the holding (exchange data, not Nebula pricing). */
  usdValue: string
}

export interface BybitBalanceResult {
  ok: boolean
  error?: string
  accountType?: string
  /** Bybit-reported total equity in USD (exchange figure). */
  totalEquityUsd?: string
  coins: BybitCoin[]
}

/**
 * Read the Unified Trading account balance. `now` is injectable for tests.
 */
export async function fetchBybitBalance(opts: {
  apiKey: string
  apiSecret: string
  fetchImpl?: typeof fetch
  now?: () => number
}): Promise<BybitBalanceResult> {
  const { apiKey, apiSecret, fetchImpl } = opts
  const f = fetchImpl ?? fetch
  const now = opts.now ?? (() => Date.now())
  const timestamp = String(now())
  const query = 'accountType=UNIFIED'
  const sign = bybitSign({
    secret: apiSecret,
    timestamp,
    apiKey,
    recvWindow: RECV_WINDOW,
    payload: query,
  })

  let res: Response
  try {
    res = await f(`${BYBIT_BASE}/v5/account/wallet-balance?${query}`, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': RECV_WINDOW,
        'X-BAPI-SIGN': sign,
      },
    })
  } catch (e) {
    return {
      ok: false,
      error: `Bybit request failed: ${(e as Error).message.slice(0, 120)}`,
      coins: [],
    }
  }
  const j = (await res.json().catch(() => ({}))) as {
    retCode?: number
    retMsg?: string
    result?: {
      list?: Array<{
        accountType?: string
        totalEquity?: string
        coin?: Array<{ coin?: string; walletBalance?: string; usdValue?: string }>
      }>
    }
  }
  if (j.retCode !== 0) {
    return { ok: false, error: `Bybit: ${j.retMsg ?? `retCode ${j.retCode}`}`, coins: [] }
  }
  const acct = j.result?.list?.[0]
  const coins = (acct?.coin ?? [])
    .map(c => ({
      coin: c.coin ?? '?',
      walletBalance: c.walletBalance ?? '0',
      usdValue: c.usdValue ?? '0',
    }))
    .filter(c => Number(c.walletBalance) > 0)
  return {
    ok: true,
    accountType: acct?.accountType ?? 'UNIFIED',
    totalEquityUsd: acct?.totalEquity ?? '0',
    coins,
  }
}
