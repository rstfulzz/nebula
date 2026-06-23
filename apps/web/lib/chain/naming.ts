// Casper naming (CSPR.name) — minimal stub.
//
// On Casper, human-readable names resolve via CSPR.name. CSPR.click already
// surfaces an account's `cspr_name` when present (see lib/use-wallet.ts), so the
// console reads names from there. This module is a placeholder for resolving a
// label → account, and is a clear no-op until the CSPR.name package hash is set.

import { CSPR_NAME_PACKAGE_HASH } from './chain'

export function namingConfigured(): boolean {
  return CSPR_NAME_PACKAGE_HASH.length > 0
}

/**
 * Resolve a CSPR.name label (e.g. "specter") → the account it points at
 * (public key / account-hash). Returns null until CSPR.name is wired.
 */
export async function resolveName(_label: string): Promise<string | null> {
  if (!namingConfigured()) return null
  // TODO: dictionary read against the CSPR.name registry package.
  return null
}

/**
 * Reverse-resolve an account (public key / account-hash) → its CSPR.name, if any.
 * Returns null until wired. CSPR.click also provides this via account.cspr_name.
 */
export async function reverseName(_account: string): Promise<string | null> {
  if (!namingConfigured()) return null
  // TODO: reverse dictionary read against the CSPR.name registry package.
  return null
}
