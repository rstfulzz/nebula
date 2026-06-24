/** 1 CSPR = 1e9 motes. */
export const MOTES_PER_CSPR = 1_000_000_000n

/**
 * Render a motes bigint as a fixed 6-decimal CSPR string. Matches the
 * statusline, `nebula balance`, and `nebula ledger balance` output styles.
 * Always emits exactly 6 decimal places (zero-padded) so columns align.
 *
 * Casper has 9 motes-decimals; we display 6 for readability. The string is
 * computed from integer motes (no float) so large balances stay exact.
 */
export function formatCspr(motes: bigint): string {
  const neg = motes < 0n
  const abs = neg ? -motes : motes
  const whole = abs / MOTES_PER_CSPR
  const frac9 = (abs % MOTES_PER_CSPR).toString().padStart(9, '0')
  const frac6 = frac9.slice(0, 6)
  return `${neg ? '-' : ''}${whole.toString()}.${frac6}`
}
