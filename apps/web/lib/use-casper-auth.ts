'use client'

// Casper console sign-in. When a Casper wallet connects (via CSPR.click), this
// auto-signs a nonce message and posts it to the server, which verifies the
// signature against the account public key and sets the session cookie. The
// session subject is the account's Casper public key, so /api/chats etc. stay
// scoped per account.

import { buildSignInMessage } from '@/lib/auth/build-message'
import { ACTIVE_NETWORK } from '@/lib/chain/chain'
import { useWallet } from '@/lib/use-wallet'
import { useCallback, useEffect, useRef, useState } from 'react'

export type CasperAuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'signing'
  | 'authenticated'
  | 'error'

export type CasperAuth = {
  status: CasperAuthStatus
  /** The authenticated account's Casper public key, or null. */
  publicKey: string | null
  /** True when a Casper wallet is connected (whether or not signed in). */
  connected: boolean
  error: string | null
  /** Opens the CSPR.click connect modal. */
  connect: () => void
  /** Signs the nonce message + establishes the server session. */
  signIn: () => Promise<boolean>
  signOut: () => Promise<void>
}

const SIGN_TIMEOUT_MS = 60_000

export function useCasperAuth(): CasperAuth {
  const wallet = useWallet()
  const { publicKey: connectedKey, connected } = wallet
  const [status, setStatus] = useState<CasperAuthStatus>('loading')
  const [sessionKey, setSessionKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  // Boot: check whether a server session already exists.
  useEffect(() => {
    let alive = true
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { publicKey?: string | null }) => {
        if (!alive) return
        if (d?.publicKey) {
          setSessionKey(d.publicKey)
          setStatus('authenticated')
        } else {
          setStatus('unauthenticated')
        }
      })
      .catch(() => {
        if (alive) setStatus('unauthenticated')
      })
    return () => {
      alive = false
    }
  }, [])

  const signIn = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false
    if (!connected || !connectedKey) {
      setError('connect a wallet first')
      return false
    }
    inFlight.current = true
    setError(null)
    setStatus('signing')
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
      const nonceResp = await fetch('/api/auth/nonce', { credentials: 'include' })
      const { nonce } = (await nonceResp.json()) as { nonce: string }

      const host = typeof window !== 'undefined' ? window.location.host : ''
      const uri = typeof window !== 'undefined' ? window.location.origin : ''
      const message = buildSignInMessage({
        publicKey: connectedKey,
        chainName: ACTIVE_NETWORK.chainName,
        nonce,
        domain: host,
        uri,
      })

      const signPromise = wallet.signMessage(message)
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('signing timed out, wallet did not respond')),
          SIGN_TIMEOUT_MS,
        )
      })
      const signature = await Promise.race([signPromise, timeoutPromise])
      if (!signature) throw new Error('signature was cancelled')

      const verifyResp = await fetch('/api/auth/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature, publicKey: connectedKey }),
      })
      if (!verifyResp.ok) {
        const j = (await verifyResp.json().catch(() => ({}))) as { reason?: string }
        throw new Error(j.reason || `verify failed (${verifyResp.status})`)
      }
      setSessionKey(connectedKey)
      setStatus('authenticated')
      return true
    } catch (err) {
      const msg = (err as Error).message || 'sign-in failed'
      setError(msg)
      setStatus('unauthenticated')
      return false
    } finally {
      if (timer) clearTimeout(timer)
      inFlight.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, connectedKey])

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // best effort
    }
    setSessionKey(null)
    setStatus('unauthenticated')
    setError(null)
    try {
      await wallet.signOut()
    } catch {
      // best effort
    }
  }, [wallet])

  // Auto-trigger sign-in the moment a wallet connects, if no session exists.
  useEffect(() => {
    if (!connected || !connectedKey) return
    if (status !== 'unauthenticated') return
    if (sessionKey && sessionKey === connectedKey) return
    const t = setTimeout(() => {
      void signIn()
    }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, connectedKey, status])

  // If the connected account no longer matches the session, clear it.
  useEffect(() => {
    if (!sessionKey) return
    if (!connected) return
    if (connectedKey && connectedKey !== sessionKey) {
      setSessionKey(null)
      setStatus('unauthenticated')
    }
  }, [connectedKey, connected, sessionKey])

  return {
    status,
    publicKey: status === 'authenticated' ? sessionKey : null,
    connected,
    error,
    connect: wallet.signIn,
    signIn,
    signOut,
  }
}
