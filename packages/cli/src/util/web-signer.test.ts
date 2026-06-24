/**
 * Unit tests for the web-signer localhost server: GET /pending serves the
 * unsigned tx + pubkey + sid; POST /signed with the right sid resolves with the
 * hash; a wrong sid is rejected (403). No browser is opened (NEBULA_NO_BROWSER).
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { signAndSubmitViaWeb } from './web-signer'

const UNSIGNED = { hash: 'deadbeef', payload: { fields: [] } }
const PUBKEY = '0203dc4a23af775ed29fc045565256c35b3519cc9bad1b7e7051172ce2cffc61cc45'

/**
 * Start a web-signer round-trip and capture the localhost port + sid from its
 * printed connect URL. Restores console.log when the URL is seen.
 */
function startSigner(): Promise<{
  promise: Promise<{ hash: string }>
  port: string
  sid: string
}> {
  return new Promise(resolve => {
    const orig = console.log
    let captured = false
    console.log = (...args: unknown[]) => {
      const line = args.map(String).join(' ')
      const m = line.match(/port=(\d+)&sid=([0-9a-f-]+)/i)
      if (m?.[1] && m[2] && !captured) {
        captured = true
        console.log = orig
        const [, port, sid] = m
        // Defer so the server's listen callback has fully returned.
        queueMicrotask(() => resolve({ promise, port, sid }))
      }
    }
    const promise = signAndSubmitViaWeb(UNSIGNED, PUBKEY)
  })
}

describe('web-signer localhost server', () => {
  beforeEach(() => {
    process.env.NEBULA_NO_BROWSER = '1'
  })
  afterEach(() => {
    process.env.NEBULA_NO_BROWSER = undefined
  })

  it('GET /pending returns the tx, pubkey, and sid', async () => {
    const { promise, port, sid } = await startSigner()

    const res = await fetch(`http://127.0.0.1:${port}/pending`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tx: unknown; pubkey: string; sid: string }
    expect(body.tx).toEqual(UNSIGNED)
    expect(body.pubkey).toBe(PUBKEY)
    expect(body.sid).toBe(sid)

    // Close out the round-trip so the server shuts down.
    await fetch(`http://127.0.0.1:${port}/signed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hash: 'abc123', sid }),
    })
    await promise
  })

  it('POST /signed with the right sid resolves with the hash', async () => {
    const { promise, port, sid } = await startSigner()

    const res = await fetch(`http://127.0.0.1:${port}/signed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hash: 'feedface', sid }),
    })
    expect(res.status).toBe(200)
    expect(await promise).toEqual({ hash: 'feedface' })
  })

  it('POST /signed with a wrong sid is rejected (403)', async () => {
    const { promise, port, sid } = await startSigner()

    const bad = await fetch(`http://127.0.0.1:${port}/signed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hash: 'nope', sid: 'not-the-sid' }),
    })
    expect(bad.status).toBe(403)

    // The real sid still works afterwards — the bad attempt didn't settle it.
    await fetch(`http://127.0.0.1:${port}/signed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hash: 'good', sid }),
    })
    expect(await promise).toEqual({ hash: 'good' })
  })
})
