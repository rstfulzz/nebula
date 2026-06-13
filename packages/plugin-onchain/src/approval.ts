/**
 * Permission-gate bridge between the deterministic policy engine and the
 * harness permission service.
 *
 * The CLI + gateway pre-tool-call hooks build a `PermissionRequest` for every
 * value-moving tool call and ask the permission service to resolve it. That
 * service is driven by the operator's session MODE (strict/prompt/off). On its
 * own it has no notion of "how much" — so under YOLO it would let any in-cap
 * spend through silently. This helper closes that gap: it runs the SAME
 * `evaluatePolicy` the tool runs and, when the policy flags the action as
 * material-risk (`requiresApproval`), the hook sets `force` on the request so
 * approval is demanded beneath the session mode. Fund controls in code, not in
 * the model (CLAUDE.md).
 *
 * Native amounts are parsed from the human MNT arg. Token amounts can't be
 * sized without decimals at this layer, so token/swap escalation rides on the
 * policy autonomy tier (which `evaluatePolicy` resolves without an amount); the
 * tool itself still enforces per-token hard caps with real decimals.
 */

import { parseEther } from 'viem'
import { type OnchainPolicy, type PolicyAction, evaluatePolicy } from './policy'
import { isNativeToken } from './tokens'

function parseMntToWei(v: unknown): bigint {
  if (typeof v !== 'string' && typeof v !== 'number') return 0n
  try {
    return parseEther(String(v))
  } catch {
    return 0n
  }
}

/** `chain.write` already carries `value` in wei (string/number/bigint). */
function parseWeiLike(v: unknown): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v))
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return BigInt(v.trim())
  return 0n
}

/** Map a tool call (name + raw args) to a best-effort PolicyAction. */
function actionForCall(name: string, a: Record<string, unknown>): PolicyAction | null {
  switch (name) {
    case 'chain.send': {
      const token = typeof a.token === 'string' ? a.token : undefined
      const native = isNativeToken(token)
      return {
        kind: 'transfer',
        asset: native ? 'native' : (token as string),
        amountRaw: native ? parseMntToWei(a.amount) : 0n,
        to: typeof a.to === 'string' ? a.to : undefined,
      }
    }
    case 'chain.wrap':
    case 'chain.unwrap':
      return { kind: 'transfer', asset: 'native', amountRaw: parseMntToWei(a.amount) }
    case 'swap.execute':
      return {
        kind: 'swap',
        asset: typeof a.tokenIn === 'string' ? a.tokenIn : 'native',
        amountRaw: 0n,
        slippageBps: typeof a.slippageBps === 'number' ? a.slippageBps : undefined,
      }
    case 'chain.write':
      return { kind: 'transfer', asset: 'native', amountRaw: parseWeiLike(a.value) }
    default:
      return null
  }
}

/**
 * True when the policy requires human approval for this tool call (the gate
 * should force a prompt regardless of mode). Returns false when no policy is
 * configured or the call is not value-moving.
 */
export function policyRequiresApprovalForCall(
  name: string,
  args: Record<string, unknown>,
  policy: OnchainPolicy | undefined,
): boolean {
  if (!policy) return false
  const action = actionForCall(name, args)
  if (!action) return false
  return evaluatePolicy(action, policy).requiresApproval
}
