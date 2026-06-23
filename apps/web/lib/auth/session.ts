// iron-session config for Casper-authed operator sessions.
// The session subject is a Casper public key.

import 'server-only'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'

export type SessionData = {
  /** Active account's Casper public key hex (the session subject). */
  publicKey?: string
  /** Casper chain name the sign-in was scoped to (casper / casper-test). */
  chainName?: string
  nonce?: string
  issuedAt?: string
}

export const SESSION_COOKIE = 'nebula-console-session'

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET env var missing or too short (need at least 32 chars). See apps/web/.env.local.example.',
    )
  }
  return secret
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), {
    password: getSecret(),
    cookieName: SESSION_COOKIE,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
    },
  })
}
