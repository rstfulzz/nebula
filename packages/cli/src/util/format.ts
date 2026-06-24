/**
 * Truncate a Casper identifier (public key hex like `0203…`, or an
 * `account-hash-…` / `hash-…` key) to first 6 + last 4 (e.g. `0203ab…cd12`)
 * for compact UI rendering. Returns the input unchanged for short values
 * (e.g. an `.0g` name, `'?'`, or empty), so callers can pass any identifier
 * without checking type first.
 */
export function shortAddr(addr?: string | null): string {
  if (!addr) return '?'
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
