'use client'

// Thin wallet abstraction over CSPR.click. Every console component talks to this
// instead of the SDK directly. The "address" is the active account's Casper
// public key hex (01… ed25519 / 02… secp256k1); accountHash is the derived
// account-hash-… identifier.

import {
  CSPRCLICK_EVENTS,
  type AccountType,
  type SignedInClickEvent,
  type SwitchedAccountClickEvent,
} from '@make-software/csprclick-core-types'
import { useCallback, useEffect, useState } from 'react'
import { useBridgedClickRef } from './wallet-context'

export type WalletState = {
  /** Active account's public key hex (01…/02…), or null when disconnected. */
  publicKey: string | null
  /** Derived account-hash-… identifier, or null. */
  accountHash: string | null
  /** Optional CSPR.name, when the account has one. */
  csprName: string | null
  connected: boolean
  /** Opens the CSPR.click sign-in / connect modal. */
  signIn: () => void
  /** Disconnects the active account. */
  signOut: () => Promise<void>
  /**
   * Sign an arbitrary message with the active account.
   * Returns the signature hex (prefixed with the key algorithm tag), or null if
   * cancelled / failed.
   */
  signMessage: (msg: string) => Promise<string | null>
  /**
   * Sign *and* submit a transaction with the active account via CSPR.click.
   * `txJson` is a casper-js-sdk Transaction's `toJSON()`. Returns the resulting
   * on-chain hash, or null if cancelled / failed.
   */
  sendTransaction: (txJson: object) => Promise<string | null>
}

/** account-hash-<hex> derived from a CSPR.click account, when available. */
function accountHashOf(acct: AccountType | null): string | null {
  if (!acct) return null
  // CSPR.click sometimes carries the account hash in `custom`; otherwise the
  // public key is the stable identifier the UI shows.
  const custom = acct.custom as { account_hash?: string; accountHash?: string } | undefined
  return custom?.account_hash ?? custom?.accountHash ?? null
}

export function useWallet(): WalletState {
  const clickRef = useBridgedClickRef()
  const [account, setAccount] = useState<AccountType | null>(null)

  useEffect(() => {
    if (!clickRef) return
    let alive = true

    // Hydrate from any already-connected account.
    const current = clickRef.getActiveAccount?.()
    if (current) setAccount(current)

    const onSignedIn = (evt: SignedInClickEvent) => {
      if (alive) setAccount(evt.account ?? clickRef.getActiveAccount?.() ?? null)
    }
    const onSwitched = (evt: SwitchedAccountClickEvent) => {
      if (alive) setAccount(evt.account ?? clickRef.getActiveAccount?.() ?? null)
    }
    const onSignedOut = () => {
      if (alive) setAccount(null)
    }

    clickRef.on(CSPRCLICK_EVENTS.SIGNED_IN as string, onSignedIn)
    clickRef.on(CSPRCLICK_EVENTS.SWITCHED_ACCOUNT as string, onSwitched)
    clickRef.on(CSPRCLICK_EVENTS.SIGNED_OUT as string, onSignedOut)
    clickRef.on(CSPRCLICK_EVENTS.DISCONNECTED as string, onSignedOut)

    return () => {
      alive = false
      clickRef.off(CSPRCLICK_EVENTS.SIGNED_IN as string, onSignedIn)
      clickRef.off(CSPRCLICK_EVENTS.SWITCHED_ACCOUNT as string, onSwitched)
      clickRef.off(CSPRCLICK_EVENTS.SIGNED_OUT as string, onSignedOut)
      clickRef.off(CSPRCLICK_EVENTS.DISCONNECTED as string, onSignedOut)
    }
  }, [clickRef])

  const signIn = useCallback(() => {
    clickRef?.signIn()
  }, [clickRef])

  const signOut = useCallback(async () => {
    try {
      clickRef?.signOut()
    } catch {
      // best effort
    }
    setAccount(null)
  }, [clickRef])

  const signMessage = useCallback(
    async (msg: string): Promise<string | null> => {
      if (!clickRef || !account?.public_key) return null
      const res = await clickRef.signMessage(msg, account.public_key)
      if (!res || res.cancelled || res.error) return null
      return res.signatureHex ?? null
    },
    [clickRef, account],
  )

  const sendTransaction = useCallback(
    async (txJson: object): Promise<string | null> => {
      if (!clickRef || !account?.public_key) return null
      // clickRef.send SIGNS *and* SUBMITS via the connected wallet, returning a
      // SendResult. The hash lives in transactionHash (new tx format) or
      // deployHash (legacy). We never re-submit on the CLI side.
      const res = await clickRef.send(txJson, account.public_key)
      if (!res || res.cancelled || res.error) return null
      return res.transactionHash ?? res.deployHash ?? null
    },
    [clickRef, account],
  )

  return {
    publicKey: account?.public_key ?? null,
    accountHash: accountHashOf(account),
    csprName: account?.cspr_name ?? null,
    connected: !!account?.public_key,
    signIn,
    signOut,
    signMessage,
    sendTransaction,
  }
}
