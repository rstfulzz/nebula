import { type ChatMessage, runAgent } from '@/lib/agent'
import { getSession } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages?: ChatMessage[]; walletAddress?: string; approve?: boolean }
    const messages = (body.messages ?? [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: String(m.content ?? '') }))
      .slice(-12) as ChatMessage[]
    if (messages.length === 0) {
      return NextResponse.json({ error: 'no messages' }, { status: 400 })
    }
    // Keyless web: the browser never signs. In treasury mode the server-side
    // agent executes through the on-chain-bounded module (using the server signer
    // as the module's agent). `approve` authorizes a funds-leaving action.
    const session = await getSession().catch(() => null)
    const walletAddress = session?.publicKey ?? body.walletAddress ?? null
    const result = await runAgent(messages, {
      authedAddress: walletAddress,
      approve: body.approve === true,
      useTreasury: true,
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
