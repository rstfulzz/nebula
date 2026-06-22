/**
 * Deterministic Casper fund-control policy — Nebula's "verifiable autonomy" core.
 *
 * The AI is advisory; fund controls are enforced here in deterministic code, NOT
 * by the model. Every write is checked BEFORE it is broadcast. The verdict is a
 * pure function of (action, policy) — no network, no model — so it is fully
 * unit-testable and auditable. Amounts are in motes (1 CSPR = 1e9 motes);
 * recipients are public keys / account hashes.
 */
const lc = (a: string): string => a.toLowerCase()

export interface OnchainPolicy {
  /** Reject every write (read-only treasury). */
  readOnly?: boolean
  /** Hard cap on native CSPR per tx, in motes. */
  maxNativeMotesPerTx?: bigint
  /** If set, transfers may only go to these recipient public keys / account hashes. */
  recipientAllowlist?: string[]
  /** If set, only these CEP-18 contract package hashes may be moved (future). */
  tokenAllowlist?: string[]
  /** auto = execute within caps; confirm = every write needs approval; readonly = block all. */
  autonomy?: 'auto' | 'confirm' | 'readonly'
  /** Native amount (motes) at/under which 'auto' executes without approval. */
  autoMaxNativeMotesPerTx?: bigint
}

export interface PolicyAction {
  kind: 'transfer' | 'stake' | 'swap'
  asset: 'native' | string
  amountMotes: bigint
  to?: string
}

export interface PolicyVerdict {
  violations: string[]
  allowed: boolean
  requiresApproval: boolean
}

/** Evaluate a proposed action against the policy. Pure + deterministic. */
export function evaluatePolicy(action: PolicyAction, policy: OnchainPolicy): PolicyVerdict {
  const violations: string[] = []
  const readOnly = policy.readOnly || policy.autonomy === 'readonly'
  if (readOnly) violations.push('policy is read-only: all writes are blocked')

  const isNative = action.asset === 'native'

  if (policy.tokenAllowlist && !isNative) {
    const allowed = policy.tokenAllowlist.map(lc)
    if (!allowed.includes(lc(action.asset))) {
      violations.push(`token ${action.asset} is not in the token allowlist`)
    }
  }

  if (policy.recipientAllowlist && action.to) {
    const allowed = policy.recipientAllowlist.map(lc)
    if (!allowed.includes(lc(action.to))) {
      violations.push(`recipient ${action.to} is not in the recipient allowlist`)
    }
  }

  if (
    isNative &&
    policy.maxNativeMotesPerTx !== undefined &&
    action.amountMotes > policy.maxNativeMotesPerTx
  ) {
    violations.push(
      `native amount ${action.amountMotes} motes exceeds per-tx cap ${policy.maxNativeMotesPerTx} motes`,
    )
  }

  const allowed = violations.length === 0
  let requiresApproval = false
  if (allowed) {
    if (policy.autonomy === 'confirm') {
      requiresApproval = true
    } else if (
      isNative &&
      policy.autoMaxNativeMotesPerTx !== undefined &&
      action.amountMotes > policy.autoMaxNativeMotesPerTx
    ) {
      requiresApproval = true
    }
  }

  return { violations, allowed, requiresApproval }
}

/**
 * Build a policy from environment (operator opt-in). Returns undefined when no
 * policy env is set.
 *   NEBULA_POLICY_READONLY=1
 *   NEBULA_POLICY_MAX_NATIVE_CSPR=100
 *   NEBULA_POLICY_AUTO_MAX_NATIVE_CSPR=5
 *   NEBULA_POLICY_AUTONOMY=auto|confirm|readonly
 *   NEBULA_POLICY_RECIPIENT_ALLOWLIST=0203...,0189...
 *   NEBULA_POLICY_TOKEN_ALLOWLIST=<pkg-hash>,<pkg-hash>
 */
export function policyFromEnv(
  env: Record<string, string | undefined> = process.env,
): OnchainPolicy | undefined {
  const toMotes = (cspr?: string): bigint | undefined => {
    if (!cspr) return undefined
    const n = Number(cspr)
    if (!Number.isFinite(n) || n < 0) return undefined
    return BigInt(Math.round(n * 1e9))
  }
  const list = (s?: string): string[] | undefined =>
    s
      ? s
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : undefined

  const policy: OnchainPolicy = {}
  let any = false
  if (env.NEBULA_POLICY_READONLY === '1') {
    policy.readOnly = true
    any = true
  }
  const maxN = toMotes(env.NEBULA_POLICY_MAX_NATIVE_CSPR)
  if (maxN !== undefined) {
    policy.maxNativeMotesPerTx = maxN
    any = true
  }
  const autoMax = toMotes(env.NEBULA_POLICY_AUTO_MAX_NATIVE_CSPR)
  if (autoMax !== undefined) {
    policy.autoMaxNativeMotesPerTx = autoMax
    any = true
  }
  const autonomy = env.NEBULA_POLICY_AUTONOMY
  if (autonomy === 'auto' || autonomy === 'confirm' || autonomy === 'readonly') {
    policy.autonomy = autonomy
    any = true
  }
  const recip = list(env.NEBULA_POLICY_RECIPIENT_ALLOWLIST)
  if (recip) {
    policy.recipientAllowlist = recip
    any = true
  }
  const toks = list(env.NEBULA_POLICY_TOKEN_ALLOWLIST)
  if (toks) {
    policy.tokenAllowlist = toks
    any = true
  }
  return any ? policy : undefined
}
