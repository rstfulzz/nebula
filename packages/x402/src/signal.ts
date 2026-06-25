/**
 * Nebula's paid capability: a deterministic **address risk pre-check** computed
 * from live CSPR.cloud data. This is a real, honest signal (no LLM, no stub):
 * given a Casper address it reads the account balance, validator status, and
 * recent transfer activity, then derives a 0..100 risk score with explainable
 * flags. The same input always yields the same output.
 */
import { CSPR_CLOUD_API_KEY, CSPR_CLOUD_REST } from './config'

export interface RiskSignal {
  address: string
  accountHash: string
  riskScore: number
  flags: string[]
  verdict: 'low' | 'medium' | 'high'
  observations: {
    exists: boolean
    balanceCspr: number
    isValidator: boolean
    recentTransferCount: number
  }
  checkedAt: string
}

interface CsprAccount {
  account_hash: string
  balance: string | null
  public_key?: string | null
}

const MOTES_PER_CSPR = 1_000_000_000

async function csprCloud<T>(
  path: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const res = await fetch(`${CSPR_CLOUD_REST}${path}`, {
    headers: CSPR_CLOUD_API_KEY ? { authorization: CSPR_CLOUD_API_KEY } : {},
  })
  if (!res.ok) return { ok: false, status: res.status }
  return { ok: true, data: (await res.json()) as T }
}

/**
 * Compute the risk signal for `address` (a Casper public-key hex or an
 * `account-hash-…` / raw account hash). Deterministic given chain state.
 */
export async function riskSignal(address: string): Promise<RiskSignal> {
  const id = address.replace(/^account-hash-/, '')

  const accountRes = await csprCloud<{ data: CsprAccount }>(`/accounts/${id}`)
  const exists = accountRes.ok
  const account = accountRes.ok ? accountRes.data.data : undefined
  const accountHash = account?.account_hash ?? (/^0[12]/.test(id) ? '' : id)
  const balanceMotes = account?.balance ? BigInt(account.balance) : 0n
  const balanceCspr = Number(balanceMotes) / MOTES_PER_CSPR

  // Validator status: the auction validators are keyed by public key.
  let isValidator = false
  if (account?.public_key || /^0[12]/.test(id)) {
    const pk = account?.public_key ?? id
    const valRes = await csprCloud<{ data: unknown[] }>(
      `/validators/${pk}/total-stakes?page=1&page_size=1`,
    )
    isValidator = valRes.ok && Array.isArray(valRes.data.data) && valRes.data.data.length > 0
  }

  // Recent fungible-token activity (settlement traffic) as an activity proxy.
  let recentTransferCount = 0
  if (accountHash) {
    const txRes = await csprCloud<{ item_count: number }>(
      `/accounts/${accountHash}/ft-token-actions?page=1&page_size=1`,
    )
    if (txRes.ok) recentTransferCount = txRes.data.item_count ?? 0
  }

  // --- Deterministic scoring. Higher = riskier counterparty for a payment. ---
  const flags: string[] = []
  let score = 0

  if (!exists) {
    score += 60
    flags.push('account_not_materialized') // never seen on-chain — unfunded / brand new
  }
  if (exists && balanceCspr === 0) {
    score += 25
    flags.push('zero_balance')
  } else if (exists && balanceCspr < 1) {
    score += 10
    flags.push('dust_balance')
  }
  if (exists && recentTransferCount === 0) {
    score += 15
    flags.push('no_recent_token_activity')
  }
  if (isValidator) {
    score = Math.max(0, score - 30)
    flags.push('known_validator') // staked, accountable identity — lowers risk
  }
  if (exists && balanceCspr >= 100) {
    score = Math.max(0, score - 10)
    flags.push('well_funded')
  }

  const riskScore = Math.min(100, Math.max(0, score))
  const verdict: RiskSignal['verdict'] =
    riskScore >= 60 ? 'high' : riskScore >= 25 ? 'medium' : 'low'

  return {
    address,
    accountHash,
    riskScore,
    flags,
    verdict,
    observations: { exists, balanceCspr, isValidator, recentTransferCount },
    checkedAt: new Date().toISOString(),
  }
}
