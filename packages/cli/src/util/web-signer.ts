/**
 * Web signing for the CLI — route transaction SIGNING through a connected
 * CSPR.click wallet when no local PEM is set.
 *
 * The CLI builds an UNSIGNED casper-js-sdk v5 transaction and hands its JSON to
 * the browser via a throwaway localhost round-trip (same shape as
 * `nebula connect`'s callback server). The web page fetches the pending tx,
 * calls `clickRef.send(txJson, pubkey)` (the wallet SIGNS *and* SUBMITS), and
 * POSTs the resulting hash back here. The CLI never re-submits — it only
 * verifies the hash on-chain afterwards.
 *
 * Security: the browser only ever sees an unsigned tx + the caller's public
 * key, and may only post back a hash carrying our one-time session id. It can
 * never inject a different signed deploy into this CLI run.
 */
import { spawn } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as http from 'node:http'

const DEFAULT_WEB_URL = 'https://nebulaai.space'
/** How long to wait for the browser to sign + submit before giving up. */
const SIGN_TIMEOUT_MS = 120_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
} as const

/** Best-effort open of a URL in the user's default browser, per platform. */
function openBrowser(url: string): void {
  // Headless / CI / tests: never spawn an opener, just rely on the printed URL.
  if (process.env.NEBULA_NO_BROWSER) return
  try {
    const cmd =
      process.platform === 'darwin'
        ? { bin: 'open', args: [url] }
        : process.platform === 'win32'
          ? { bin: 'cmd', args: ['/c', 'start', '', url] }
          : { bin: 'xdg-open', args: [url] }
    const child = spawn(cmd.bin, cmd.args, { stdio: 'ignore', detached: true })
    child.on('error', () => {
      // Best effort: if the opener binary is missing, the printed URL is enough.
    })
    child.unref()
  } catch {
    // Ignore — the URL is already printed for the user to open manually.
  }
}

/** Read a request body to a string (bounded by what node buffers for us). */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => {
      data += chunk
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

/**
 * Hand an unsigned transaction to a connected web wallet for signing + submit,
 * and resolve with the resulting on-chain hash.
 *
 * @param unsignedTxJson  `tx.toJSON()` of an unsigned casper-js-sdk Transaction.
 * @param fromPublicKeyHex  The signing account's hex public key (01…/02…).
 */
export function signAndSubmitViaWeb(
  unsignedTxJson: object,
  fromPublicKeyHex: string,
): Promise<{ hash: string }> {
  const webUrl = process.env.NEBULA_WEB_URL ?? DEFAULT_WEB_URL
  const sid = crypto.randomUUID()

  return new Promise<{ hash: string }>((resolve, reject) => {
    let settled = false

    const server = http.createServer((req, res) => {
      const url = req.url ?? ''

      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS).end()
        return
      }

      // GET /pending — the browser fetches the unsigned tx to sign.
      if (req.method === 'GET' && url.startsWith('/pending')) {
        res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' })
        res.end(JSON.stringify({ tx: unsignedTxJson, pubkey: fromPublicKeyHex, sid }))
        return
      }

      // POST /signed — the browser posts back the submitted tx hash.
      if (req.method === 'POST' && url.startsWith('/signed')) {
        void readBody(req).then(raw => {
          let body: { hash?: unknown; sid?: unknown }
          try {
            body = JSON.parse(raw)
          } catch {
            res.writeHead(400, { ...CORS_HEADERS, 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }))
            return
          }

          // Reject callbacks that don't carry our one-time session id — a stray
          // tab / replay can't inject a hash into this CLI run.
          if (body.sid !== sid) {
            res.writeHead(403, { ...CORS_HEADERS, 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'sid mismatch' }))
            return
          }

          const hash = typeof body.hash === 'string' ? body.hash : ''
          if (!hash) {
            res.writeHead(400, { ...CORS_HEADERS, 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'missing hash' }))
            return
          }

          res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))

          if (!settled) {
            settled = true
            clearTimeout(timer)
            server.close()
            resolve({ hash })
          }
        })
        return
      }

      // Everything else is a 404 (browsers may probe).
      res.writeHead(404, CORS_HEADERS).end()
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = addr && typeof addr === 'object' ? addr.port : 0
      const link = `${webUrl}/cli-sign#port=${port}&sid=${sid}`
      console.log('Approve this transaction in your connected wallet:')
      console.log(`  ${link}`)
      console.log('(If it does not open automatically, open this URL.)')
      openBrowser(link)
    })

    // Give up after the timeout so the CLI never blocks forever on a browser.
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      server.close()
      reject(new Error('web signing timed out'))
    }, SIGN_TIMEOUT_MS)
    timer.unref?.()
  })
}
