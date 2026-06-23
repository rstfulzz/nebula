import { readChats, writeChats } from '@/lib/chat-history-store'
import { getSession } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Chat history is private to the signed-in account. The public key always comes
// from the verified Casper sign-in session — never from the client — so one
// account can't read or overwrite another's history.

export async function GET() {
  const session = await getSession().catch(() => null)
  if (!session?.publicKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const conversations = await readChats(session.publicKey)
  return NextResponse.json({ conversations })
}

export async function PUT(req: Request) {
  const session = await getSession().catch(() => null)
  if (!session?.publicKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => null)) as { conversations?: unknown } | null
  const saved = await writeChats(session.publicKey, body?.conversations ?? [])
  return NextResponse.json({ ok: true, count: saved.length })
}
