// Complete a Telegram pairing: the link page derives the agent client-side and
// posts the agent key here ONCE. The server verifies key↔public-key, seals the
// key in the vault, and binds it to the Telegram user with a TTL + per-tx cap.
//
// This is the Hybrid model's single custody point — the operator explicitly opts
// in on the link page (with a clear warning). The plaintext key exists only for
// this request; at rest it is sealed (AES-256-GCM).
import 'server-only'
import { completePairing } from '@/lib/telegram-store'
import { seal, vaultReady } from '@/lib/vault'
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    if (!vaultReady()) {
      return NextResponse.json({ error: 'Telegram bridge not configured on this server.' }, { status: 503 })
    }
    const body = (await req.json()) as {
      code?: string
      agentKey?: string
      agentPublicKey?: string
      ttlHours?: number
      policyMaxCspr?: number
    }
    if (!body.code || !body.agentKey || !/^[0-9a-fA-F]+$/.test(body.agentKey)) {
      return NextResponse.json({ error: 'missing code or agentKey' }, { status: 400 })
    }
    // Re-derive the public key from the secp256k1 agent key (Casper).
    const privateKey = PrivateKey.fromHex(body.agentKey, KeyAlgorithm.SECP256K1)
    const publicKey = privateKey.publicKey.toHex()
    if (!body.agentPublicKey || publicKey.toLowerCase() !== body.agentPublicKey.toLowerCase()) {
      return NextResponse.json({ error: 'agentKey does not match agentPublicKey' }, { status: 400 })
    }
    const ttlMs = Math.min(168, Math.max(1, Number(body.ttlHours) || 24)) * 3_600_000 // 1h..7d, default 24h
    const policyMaxCspr = Math.min(100, Math.max(0, Number(body.policyMaxCspr) || 1))
    const res = completePairing({
      code: body.code,
      agentAddress: publicKey,
      sealedKey: seal(body.agentKey),
      ttlMs,
      policyMaxCspr: policyMaxCspr,
    })
    if ('error' in res) return NextResponse.json(res, { status: 400 })
    return NextResponse.json({ ok: true, agentPublicKey: publicKey })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
