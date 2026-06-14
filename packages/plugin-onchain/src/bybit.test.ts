import { describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { type BybitBalanceResult, bybitSign, fetchBybitBalance } from './bybit'

describe('bybitSign (V5 HMAC)', () => {
  const base = {
    secret: 'sek',
    timestamp: '1700000000000',
    apiKey: 'key',
    recvWindow: '5000',
    payload: 'accountType=UNIFIED',
  }

  test('matches HMAC_SHA256(timestamp+apiKey+recvWindow+payload, secret)', () => {
    const expected = createHmac('sha256', base.secret)
      .update(base.timestamp + base.apiKey + base.recvWindow + base.payload)
      .digest('hex')
    expect(bybitSign(base)).toBe(expected)
    expect(bybitSign(base)).toMatch(/^[a-f0-9]{64}$/)
  })

  test('is deterministic and input-sensitive', () => {
    expect(bybitSign(base)).toBe(bybitSign(base))
    expect(bybitSign({ ...base, timestamp: '1700000000001' })).not.toBe(bybitSign(base))
    expect(bybitSign({ ...base, payload: 'accountType=SPOT' })).not.toBe(bybitSign(base))
  })
})

function fakeFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
}

describe('fetchBybitBalance', () => {
  test('parses a retCode:0 response, drops zero balances', async () => {
    const r: BybitBalanceResult = await fetchBybitBalance({
      apiKey: 'k',
      apiSecret: 's',
      now: () => 1700000000000,
      fetchImpl: fakeFetch({
        retCode: 0,
        result: {
          list: [
            {
              accountType: 'UNIFIED',
              totalEquity: '1234.56',
              coin: [
                { coin: 'USDT', walletBalance: '1000', usdValue: '1000' },
                { coin: 'BTC', walletBalance: '0', usdValue: '0' },
              ],
            },
          ],
        },
      }),
    })
    expect(r.ok).toBe(true)
    expect(r.totalEquityUsd).toBe('1234.56')
    expect(r.coins).toHaveLength(1)
    expect(r.coins[0]?.coin).toBe('USDT')
  })

  test('surfaces a non-zero retCode as an error (e.g. bad key)', async () => {
    const r = await fetchBybitBalance({
      apiKey: 'k',
      apiSecret: 's',
      now: () => 1,
      fetchImpl: fakeFetch({ retCode: 10003, retMsg: 'API key is invalid' }),
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/API key is invalid/)
  })
})
