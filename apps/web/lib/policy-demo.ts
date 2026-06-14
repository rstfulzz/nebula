/**
 * Browser-faithful port of the on-chain policy engine
 * (`packages/plugin-onchain/src/policy.ts`). Pure + deterministic, MNT amounts
 * as numbers for the playground. The verdict logic mirrors the real engine:
 * the AI is advisory; this code decides what is allowed.
 */

export type Autonomy = 'auto' | 'confirm' | 'readonly'

export interface DemoPolicy {
  readOnly?: boolean
  maxNativeMnt?: number | null
  autoMaxNativeMnt?: number | null
  maxSlippageBps?: number | null
  recipientAllowlist?: string[]
  tokenAllowlist?: string[]
  autonomy?: Autonomy
}

export interface DemoAction {
  kind: 'transfer' | 'swap'
  /** 'native' or a token symbol/address. For a swap: the INPUT asset. */
  asset: string
  amountMnt: number
  to?: string
  /** Swap OUTPUT asset (checked against the token allowlist). */
  toAsset?: string
  slippageBps?: number
}

export interface DemoVerdict {
  violations: string[]
  allowed: boolean
  requiresApproval: boolean
}

const lc = (s: string) => s.trim().toLowerCase()
const isNative = (s: string) => {
  const v = lc(s)
  return v === 'native' || v === 'mnt'
}

export function evaluateDemoPolicy(action: DemoAction, policy: DemoPolicy): DemoVerdict {
  const violations: string[] = []
  const readOnly = policy.readOnly || policy.autonomy === 'readonly'
  if (readOnly) violations.push('policy is read-only: all writes are blocked')

  const inputNative = isNative(action.asset)

  // Token allowlist — input AND, for swaps, output (else you could swap an
  // allowed token into an arbitrary one).
  if (policy.tokenAllowlist && policy.tokenAllowlist.length > 0) {
    const allowed = policy.tokenAllowlist.map(lc)
    if (!inputNative && !allowed.includes(lc(action.asset))) {
      violations.push(`token ${action.asset} is not in the token allowlist`)
    }
    if (action.kind === 'swap' && action.toAsset && !isNative(action.toAsset)) {
      if (!allowed.includes(lc(action.toAsset))) {
        violations.push(`swap output token ${action.toAsset} is not in the token allowlist`)
      }
    }
  }

  // Recipient allowlist (transfers).
  if (policy.recipientAllowlist && policy.recipientAllowlist.length > 0 && action.to) {
    const allowed = policy.recipientAllowlist.map(lc)
    if (!allowed.includes(lc(action.to))) {
      violations.push(`recipient ${action.to} is not in the recipient allowlist`)
    }
  }

  // Native per-tx cap.
  if (inputNative && policy.maxNativeMnt != null && action.amountMnt > policy.maxNativeMnt) {
    violations.push(`native amount ${action.amountMnt} MNT exceeds per-tx cap ${policy.maxNativeMnt} MNT`)
  }

  // Slippage cap (swaps).
  if (
    action.slippageBps != null &&
    policy.maxSlippageBps != null &&
    action.slippageBps > policy.maxSlippageBps
  ) {
    violations.push(`slippage ${action.slippageBps} bps exceeds max ${policy.maxSlippageBps} bps`)
  }

  const allowed = violations.length === 0

  let requiresApproval = false
  if (allowed) {
    if (policy.autonomy === 'confirm') {
      requiresApproval = true
    } else if (
      inputNative &&
      policy.autoMaxNativeMnt != null &&
      action.amountMnt > policy.autoMaxNativeMnt
    ) {
      requiresApproval = true
    }
  }

  return { violations, allowed, requiresApproval }
}
