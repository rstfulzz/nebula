// Complete a Telegram pairing: the link page derives the agent client-side and
// posts the agent key here ONCE. The server verifies key↔address, seals the key
// in the vault, and binds it to the Telegram user with a TTL + per-tx cap.
//
// This is the Hybrid model's single custody point — the operator explicitly opts
// in on the link page (with a clear warning). The plaintext key exists only for
// this request; at rest it is sealed (AES-256-GCM).
import 'server-only'
import { completePairing } from '@/lib/telegram-store'
import { seal, vaultReady } from '@/lib/vault'
import { NextResponse } from 'next/server'
import { type Hex, isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    if (!vaultReady()) {
      return NextResponse.json({ error: 'Telegram bridge not configured on this server.' }, { status: 503 })
    }
    const body = (await req.json()) as {
      code?: string
      agentKey?: string
      agentAddress?: string
      ttlHours?: number
      policyMaxMnt?: number
    }
    if (!body.code || !body.agentKey || !isHex(body.agentKey)) {
      return NextResponse.json({ error: 'missing code or agentKey' }, { status: 400 })
    }
    const account = privateKeyToAccount(body.agentKey as Hex)
    if (!body.agentAddress || account.address.toLowerCase() !== body.agentAddress.toLowerCase()) {
      return NextResponse.json({ error: 'agentKey does not match agentAddress' }, { status: 400 })
    }
    const ttlMs = Math.min(168, Math.max(1, Number(body.ttlHours) || 24)) * 3_600_000 // 1h..7d, default 24h
    const policyMaxMnt = Math.min(100, Math.max(0, Number(body.policyMaxMnt) || 1))
    const res = completePairing({
      code: body.code,
      agentAddress: account.address,
      sealedKey: seal(body.agentKey),
      ttlMs,
      policyMaxMnt,
    })
    if ('error' in res) return NextResponse.json(res, { status: 400 })
    return NextResponse.json({ ok: true, agentAddress: account.address })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
