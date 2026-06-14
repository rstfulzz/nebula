/**
 * Deterministic on-chain policy engine — Nebula's "verifiable autonomy" core.
 *
 * The project rule (CLAUDE.md): the AI is advisory; fund controls are enforced
 * in deterministic code, NOT by the model. Every write is checked here BEFORE
 * it is simulated/broadcast. The verdict is a pure function of (action, policy)
 * — no network, no model — so it is fully unit-testable and auditable.
 *
 * Order of the write pipeline: policy → simulate → (approval) → execute → receipt.
 */

/** Address normalization for case-insensitive comparison. */
const lc = (a: string): string => a.toLowerCase()

export interface OnchainPolicy {
  /** Reject every write (read-only treasury). */
  readOnly?: boolean
  /** Hard cap on native MNT per tx, in wei. */
  maxNativeWeiPerTx?: bigint
  /** Per-token hard cap in raw units, keyed by lowercased token address. */
  maxTokenRawPerTx?: Record<string, bigint>
  /** If set, only these token addresses (lowercased) may be moved/swapped. 'native' allowed by default. */
  tokenAllowlist?: string[]
  /** If set, transfers may only go to these recipient addresses. */
  recipientAllowlist?: string[]
  /** Max swap slippage tolerance, in basis points. */
  maxSlippageBps?: number
  /**
   * Autonomy tier:
   *  - 'auto'     execute within caps without asking
   *  - 'confirm'  every write needs human approval
   *  - 'readonly' alias for readOnly=true
   * A native send above `autoMaxNativeWeiPerTx` always escalates to approval.
   */
  autonomy?: 'auto' | 'confirm' | 'readonly'
  /** Native amount (wei) at/under which 'auto' tier executes without approval. */
  autoMaxNativeWeiPerTx?: bigint
}

export interface PolicyAction {
  kind: 'transfer' | 'swap'
  /** 'native' or a token contract address. */
  asset: 'native' | string
  /** Amount in raw units (wei for native). */
  amountRaw: bigint
  /** Recipient (transfers only). */
  to?: string
  /** Swap slippage tolerance in bps. */
  slippageBps?: number
}

export interface PolicyVerdict {
  /** Hard policy violations — if non-empty the action is BLOCKED. */
  violations: string[]
  /** True when the action is permitted to proceed (no violations). */
  allowed: boolean
  /** True when a permitted action still needs human approval before execution. */
  requiresApproval: boolean
}

/**
 * Evaluate a proposed on-chain action against the policy. Pure + deterministic.
 */
export function evaluatePolicy(action: PolicyAction, policy: OnchainPolicy): PolicyVerdict {
  const violations: string[] = []
  const readOnly = policy.readOnly || policy.autonomy === 'readonly'
  if (readOnly) violations.push('policy is read-only: all writes are blocked')

  const isNative = action.asset === 'native'
  const asset = isNative ? 'native' : lc(action.asset)

  // Token allowlist (native is always permitted unless 'native' is excluded).
  if (policy.tokenAllowlist && !isNative) {
    const allowed = policy.tokenAllowlist.map(lc)
    if (!allowed.includes(asset)) {
      violations.push(`token ${action.asset} is not in the token allowlist`)
    }
  }

  // Recipient allowlist (transfers).
  if (policy.recipientAllowlist && action.to) {
    const allowed = policy.recipientAllowlist.map(lc)
    if (!allowed.includes(lc(action.to))) {
      violations.push(`recipient ${action.to} is not in the recipient allowlist`)
    }
  }

  // Per-tx amount caps.
  if (
    isNative &&
    policy.maxNativeWeiPerTx !== undefined &&
    action.amountRaw > policy.maxNativeWeiPerTx
  ) {
    violations.push(
      `native amount ${action.amountRaw} wei exceeds per-tx cap ${policy.maxNativeWeiPerTx} wei`,
    )
  }
  if (!isNative && policy.maxTokenRawPerTx) {
    const cap = policy.maxTokenRawPerTx[asset]
    if (cap !== undefined && action.amountRaw > cap) {
      violations.push(`amount ${action.amountRaw} exceeds per-tx cap ${cap} for token ${asset}`)
    }
  }

  // Slippage cap (swaps).
  if (
    action.slippageBps !== undefined &&
    policy.maxSlippageBps !== undefined &&
    action.slippageBps > policy.maxSlippageBps
  ) {
    violations.push(`slippage ${action.slippageBps} bps exceeds max ${policy.maxSlippageBps} bps`)
  }

  const allowed = violations.length === 0

  // Approval gate: 'confirm' tier always needs approval; 'auto' escalates only
  // when a native send is above the auto ceiling (material risk).
  let requiresApproval = false
  if (allowed) {
    if (policy.autonomy === 'confirm') {
      requiresApproval = true
    } else if (
      isNative &&
      policy.autoMaxNativeWeiPerTx !== undefined &&
      action.amountRaw > policy.autoMaxNativeWeiPerTx
    ) {
      requiresApproval = true
    }
  }

  return { violations, allowed, requiresApproval }
}

/**
 * Build a policy from environment variables (operator opt-in). Returns
 * undefined when no policy env is set (no enforcement, back-compat).
 *   NEBULA_POLICY_READONLY=1
 *   NEBULA_POLICY_MAX_NATIVE_MNT=1.5
 *   NEBULA_POLICY_AUTO_MAX_NATIVE_MNT=0.1
 *   NEBULA_POLICY_MAX_SLIPPAGE_BPS=100
 *   NEBULA_POLICY_AUTONOMY=auto|confirm|readonly
 *   NEBULA_POLICY_RECIPIENT_ALLOWLIST=0xabc...,0xdef...
 *   NEBULA_POLICY_TOKEN_ALLOWLIST=0x...,0x...
 */
export function policyFromEnv(
  env: Record<string, string | undefined> = process.env,
): OnchainPolicy | undefined {
  const toWei = (mnt?: string): bigint | undefined => {
    if (!mnt) return undefined
    const n = Number(mnt)
    if (!Number.isFinite(n) || n < 0) return undefined
    return BigInt(Math.round(n * 1e9)) * 1_000_000_000n // mnt -> wei, 9+9 to avoid float loss
  }
  const list = (s?: string): string[] | undefined =>
    s
      ? s
          .split(',')
          .map(x => x.trim())
          .filter(Boolean)
      : undefined

  const policy: OnchainPolicy = {}
  let any = false
  if (env.NEBULA_POLICY_READONLY === '1') {
    policy.readOnly = true
    any = true
  }
  const maxNative = toWei(env.NEBULA_POLICY_MAX_NATIVE_MNT)
  if (maxNative !== undefined) {
    policy.maxNativeWeiPerTx = maxNative
    any = true
  }
  const autoMax = toWei(env.NEBULA_POLICY_AUTO_MAX_NATIVE_MNT)
  if (autoMax !== undefined) {
    policy.autoMaxNativeWeiPerTx = autoMax
    any = true
  }
  if (env.NEBULA_POLICY_MAX_SLIPPAGE_BPS) {
    const bps = Number(env.NEBULA_POLICY_MAX_SLIPPAGE_BPS)
    if (Number.isFinite(bps) && bps >= 0) {
      policy.maxSlippageBps = bps
      any = true
    }
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
