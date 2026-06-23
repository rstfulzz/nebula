// Formatting helpers (Casper-native). Addresses are Casper public keys /
// account-hashes; balances are in motes (1 CSPR = 1e9 motes, 9 decimals).

export function shortAddress(a: string, head = 6, tail = 4): string {
  if (!a) return ''
  if (a.length <= head + tail + 2) return a
  return `${a.slice(0, head)}…${a.slice(-tail)}`
}

export function shortHash(h: string, head = 8, tail = 6): string {
  if (!h) return ''
  if (h.length <= head + tail + 2) return h
  return `${h.slice(0, head)}…${h.slice(-tail)}`
}

export function formatBigInt(n: bigint): string {
  return new Intl.NumberFormat('en-US').format(n)
}

export function formatRelativeTime(secondsAgo: number): string {
  if (secondsAgo < 0) return 'just now'
  if (secondsAgo < 60) return `${secondsAgo}s ago`
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`
  return `${Math.floor(secondsAgo / 86400)}d ago`
}

/** Format a motes amount (1 CSPR = 1e9 motes) to a CSPR string. */
export function formatMotes(motes: bigint, decimals = 4): string {
  const negative = motes < 0n
  const w = negative ? -motes : motes
  const base = 10n ** 9n
  const whole = w / base
  const frac = w % base
  const fracStr = frac.toString().padStart(9, '0').slice(0, decimals).replace(/0+$/, '')
  const sign = negative ? '-' : ''
  return fracStr ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`
}
