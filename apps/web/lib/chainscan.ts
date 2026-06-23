// cspr.live explorer link helpers (Casper). Contract identifiers are package
// hashes; accounts are public keys / account-hashes.

import { ACTIVE_NETWORK } from './chain/chain'

const EXPLORER_BASE = ACTIVE_NETWORK.explorer

// Nebula Casper contract package hashes, read from env (empty until deployed).
export const CONTRACTS = {
  AgentIdentity: process.env.NEXT_PUBLIC_NEBULA_IDENTITY_PACKAGE_HASH ?? '',
  Inbox: process.env.NEXT_PUBLIC_NEBULA_INBOX_PACKAGE_HASH ?? '',
  Market: process.env.NEXT_PUBLIC_NEBULA_MARKET_PACKAGE_HASH ?? '',
} as const

export function txUrl(deployHash: string) {
  return `${EXPLORER_BASE}/deploy/${deployHash}`
}

export function addressUrl(account: string) {
  return `${EXPLORER_BASE}/account/${account}`
}

export function tokenUrl(packageHash: string, tokenId: string | number) {
  return `${EXPLORER_BASE}/contract-package/${packageHash}?tokenId=${tokenId}`
}

export function truncate(value: string, head = 6, tail = 4): string {
  if (!value) return ''
  if (value.length <= head + tail + 2) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}
