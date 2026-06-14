import { describe, expect, test } from 'bun:test'
import { categorySummary, fetchNansenLabels, redFlags } from './nansen'

// Live endpoint is credit-metered (verified once: profiler/address/labels 200);
// these exercise the parsing + flag logic with an injected fetch.
function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
}

describe('fetchNansenLabels', () => {
  test('parses labels on 200', async () => {
    const r = await fetchNansenLabels({
      address: '0xabc',
      chain: 'ethereum',
      apiKey: 'k',
      fetchImpl: fakeFetch(200, {
        data: [
          { label: 'Binance: Hot Wallet', category: 'exchange' },
          { label: 'vitalik.eth', category: 'social' },
        ],
      }),
    })
    expect(r.ok).toBe(true)
    expect(r.labels).toHaveLength(2)
    expect(r.labels[0]?.category).toBe('exchange')
  })

  test('surfaces the out-of-credits 403 cleanly (no throw)', async () => {
    const r = await fetchNansenLabels({
      address: '0xabc',
      chain: 'ethereum',
      apiKey: 'k',
      fetchImpl: fakeFetch(403, { error: 'Insufficient credits' }),
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Insufficient credits/)
    expect(r.labels).toEqual([])
  })

  test('handles a non-200 error', async () => {
    const r = await fetchNansenLabels({
      address: '0xabc',
      chain: 'ethereum',
      apiKey: 'k',
      fetchImpl: fakeFetch(500, {}),
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Nansen API 500/)
  })
})

describe('redFlags', () => {
  test('flags scam/hack/sanctioned/mixer categories', () => {
    expect(redFlags([{ label: 'x', category: 'scam' }])).toContain('scam')
    expect(redFlags([{ label: 'x', category: 'Sanctioned Entity' }]).length).toBe(1)
    expect(redFlags([{ label: 'x', category: 'exchange' }])).toEqual([])
  })
})

describe('categorySummary', () => {
  test('counts categories', () => {
    const s = categorySummary([
      { label: 'a', category: 'social' },
      { label: 'b', category: 'social' },
      { label: 'c', category: 'exchange' },
    ])
    expect(s.social).toBe(2)
    expect(s.exchange).toBe(1)
  })
})
