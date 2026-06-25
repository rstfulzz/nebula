/**
 * Local RPC auth-proxy for the Odra livenet client against CSPR.cloud.
 * - POST /rpc  → forwards to the CSPR.cloud node with the Authorization header.
 * - GET  /events (or any event-stream) → returns an open, empty SSE stream so
 *   the livenet's deploy watcher connects (and submits the deploy) instead of
 *   erroring. The real deploy result is read on-chain afterwards by hash.
 *
 * Run: bun scripts/casper/auth-proxy.ts   (CSPR_CLOUD_API_KEY in env)
 */
const TARGET = process.env.CASPER_NODE_RPC ?? 'https://node.testnet.cspr.cloud/rpc'
const KEY = process.env.CSPR_CLOUD_API_KEY ?? ''
const PORT = Number(process.env.AUTH_PROXY_PORT ?? 8899)

Bun.serve({
  port: PORT,
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url)
    const wantsEvents =
      url.pathname.includes('event') || req.headers.get('accept')?.includes('event-stream')
    if (wantsEvents) {
      // Open SSE stream that stays connected (keepalive comment), carries no
      // events — the livenet submits the deploy, then we read the result by hash.
      const stream = new ReadableStream({
        start(c) {
          // Casper SSE handshake the livenet waits for before submitting.
          c.enqueue(new TextEncoder().encode('data:{"ApiVersion":"2.0.0"}\n\n'))
          // then stay open (no further events; result is read on-chain by hash)
        },
      })
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      })
    }
    const body = req.method === 'POST' ? await req.text() : undefined
    let method = ''
    if (body) {
      try {
        method = JSON.parse(body).method ?? ''
      } catch {}
    }
    const res = await fetch(TARGET, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: KEY },
      body,
    })
    const text = await res.text()
    if (method) console.error('[rpc]', method, method.includes('put') ? text.slice(0, 320) : '')
    return new Response(text, { status: res.status, headers: { 'content-type': 'application/json' } })
  },
})
console.log(`auth-proxy on :${PORT} → ${TARGET}  (+Authorization; /events → open SSE)`)
