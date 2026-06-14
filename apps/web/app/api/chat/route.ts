import { type ChatMessage, runAgent } from '@/lib/agent'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages?: ChatMessage[] }
    const messages = (body.messages ?? [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: String(m.content ?? '') }))
      .slice(-12) as ChatMessage[]
    if (messages.length === 0) {
      return NextResponse.json({ error: 'no messages' }, { status: 400 })
    }
    const result = await runAgent(messages)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
