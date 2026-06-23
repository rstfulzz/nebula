import { verifyCasperSignIn } from '@/lib/auth/messages'
import { getSession } from '@/lib/auth/session'
import { ACTIVE_NETWORK } from '@/lib/chain/chain'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await getSession()
  const expectedNonce = session.nonce
  if (!expectedNonce) {
    return Response.json({ ok: false, reason: 'no nonce issued' }, { status: 400 })
  }

  let body: { message?: string; signature?: string; publicKey?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ ok: false, reason: 'invalid json' }, { status: 400 })
  }
  if (!body.message || !body.signature || !body.publicKey) {
    return Response.json(
      { ok: false, reason: 'missing message, signature, or publicKey' },
      { status: 400 },
    )
  }

  const host = req.headers.get('host') || ''
  // Accept either host (with port, common for localhost) or bare hostname.
  const candidates = new Set<string>([host, host.split(':')[0]])

  let result: Awaited<ReturnType<typeof verifyCasperSignIn>> | null = null
  for (const d of candidates) {
    result = await verifyCasperSignIn(
      body.message,
      body.signature,
      body.publicKey,
      expectedNonce,
      d,
    )
    if (result.ok) break
  }
  if (!result || !result.ok) {
    return Response.json({ ok: false, reason: result?.reason ?? 'verify failed' }, { status: 401 })
  }

  session.publicKey = result.publicKey
  session.chainName = ACTIVE_NETWORK.chainName
  // Rotate the nonce so the same message cannot be replayed.
  session.nonce = undefined
  await session.save()
  return Response.json({ ok: true, publicKey: result.publicKey })
}
