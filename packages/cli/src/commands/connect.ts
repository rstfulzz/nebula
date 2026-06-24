/**
 * `nebula connect` / `nebula disconnect` — link a CSPR.click web wallet.
 *
 * Instead of pointing the CLI at a local PEM, the user connects a wallet from
 * the browser. `connect` spins up a throwaway localhost HTTP server, opens the
 * web app's /cli-connect page (passing the server's port + a one-time sid via
 * the URL fragment), and waits for the page to POST back the chosen public key.
 * The key is stored at ~/.nebula/connected-wallet.json and used for read-only
 * chain access; writes still require a PEM until web-based signing lands.
 *
 * Scope: identity / read-only foundation only. Web transaction signing is a
 * follow-up — the seam is here (the server only ever accepts a public key, never
 * a signed deploy) and in util/connected-wallet (read-only `pub`, never a signer).
 */
import { spawn } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { PublicKey } from 'casper-js-sdk'
import { connectedWalletPath } from '../util/connected-wallet'
import { shortAddr } from '../util/format'

const DEFAULT_WEB_URL = 'https://nebulaai.space'
/** How long to wait for the browser callback before giving up. */
const CONNECT_TIMEOUT_MS = 120_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
} as const

/** Best-effort open of a URL in the user's default browser, per platform. */
function openBrowser(url: string): void {
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

function persist(publicKey: string): void {
  const file = connectedWalletPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    `${JSON.stringify({ publicKey, connectedAt: new Date().toISOString() }, null, 2)}\n`,
  )
}

export async function runConnect(): Promise<void> {
  const webUrl = process.env.NEBULA_WEB_URL ?? DEFAULT_WEB_URL
  const sid = crypto.randomUUID()

  await new Promise<void>(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }

    const server = http.createServer((req, res) => {
      const url = req.url ?? ''
      // Only /cb is meaningful; everything else is a 404 (browsers may probe).
      if (!url.startsWith('/cb')) {
        res.writeHead(404).end()
        return
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS).end()
        return
      }

      if (req.method !== 'POST') {
        res.writeHead(405, CORS_HEADERS).end()
        return
      }

      void readBody(req).then(raw => {
        let body: { publicKey?: unknown; sid?: unknown }
        try {
          body = JSON.parse(raw)
        } catch {
          res.writeHead(400, { ...CORS_HEADERS, 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }))
          return
        }

        // Reject callbacks that don't carry our one-time session id — a stray
        // tab / replay can't link a wallet to this CLI run.
        if (body.sid !== sid) {
          res.writeHead(403, { ...CORS_HEADERS, 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'sid mismatch' }))
          return
        }

        const publicKey = typeof body.publicKey === 'string' ? body.publicKey : ''
        try {
          // Casper public keys are hex (01… ed25519 / 02… secp256k1), no 0x.
          PublicKey.fromHex(publicKey)
        } catch {
          res.writeHead(400, { ...CORS_HEADERS, 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'invalid public key' }))
          return
        }

        persist(publicKey)
        res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))

        console.log(`\n✓ connected as ${shortAddr(publicKey)}`)
        console.log('Reads now use this wallet. Writes still need a PEM until web-signing lands.')
        server.close()
        finish()
      })
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = addr && typeof addr === 'object' ? addr.port : 0
      const link = `${webUrl}/cli-connect#port=${port}&sid=${sid}`
      console.log('Connect your Casper wallet in the browser:')
      console.log(`  ${link}`)
      console.log('(If it does not open automatically, open this URL.)')
      openBrowser(link)
    })

    // Give up after the timeout so the CLI never blocks forever on a browser.
    const timer = setTimeout(() => {
      if (settled) return
      console.log('\nNo wallet connected within 2 minutes — giving up. Run `nebula connect` again.')
      server.close()
      finish()
    }, CONNECT_TIMEOUT_MS)
    timer.unref?.()
  })
}

export async function runDisconnect(): Promise<void> {
  const file = connectedWalletPath()
  if (fs.existsSync(file)) {
    fs.rmSync(file)
    console.log('✓ disconnected — the linked web wallet was removed.')
  } else {
    console.log('No web wallet was connected.')
  }
}
