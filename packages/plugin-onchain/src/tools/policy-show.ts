/**
 * `policy.show` — surface the active deterministic fund-control policy.
 *
 * The control layer is only trustworthy if it is legible. This read-only tool
 * reports exactly which caps, allowlists, and autonomy tier are in force for
 * this session (resolved from NEBULA_POLICY_* at runtime), so the operator (and
 * the agent, when asked "what are my limits") sees the enforced boundary rather
 * than guessing. No signer, no state change.
 */

import type { ToolDef } from 'nebula-ai-core'
import { formatEther } from 'viem'
import { z } from 'zod'
import type { OnchainRuntimeContext } from '../types'

const Schema = z.object({})
type Args = z.infer<typeof Schema>

export function makePolicyShow(ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'policy.show',
    description:
      'Show the active deterministic fund-control policy: hard caps, allowlists, slippage cap, autonomy tier, and the approval threshold. Read-only. Call this for "what are my limits", "what can you spend", "show the policy", or before explaining why an action was blocked or needs approval.',
    searchHint:
      'policy limits caps allowlist autonomy approval guardrails rules what can you spend',
    schema: Schema,
    handler: async () => {
      const p = ctx.policy
      if (!p) {
        return {
          ok: true,
          data: {
            enforced: false,
            note: 'No NEBULA_POLICY_* configured — there are no in-code caps this session. Set NEBULA_POLICY_* (e.g. MAX_NATIVE_MNT, AUTO_MAX_NATIVE_MNT, AUTONOMY) to arm fund controls. Value-moving actions still go through the session permission mode + pre-flight simulation.',
          },
        }
      }
      const readOnly = p.readOnly === true || p.autonomy === 'readonly'
      const maxNative =
        p.maxNativeWeiPerTx === undefined ? null : `${formatEther(p.maxNativeWeiPerTx)} MNT`
      const autoUpTo =
        p.autoMaxNativeWeiPerTx === undefined ? null : `${formatEther(p.autoMaxNativeWeiPerTx)} MNT`
      const lines: string[] = []
      if (readOnly) lines.push('READ-ONLY: all writes are blocked.')
      if (maxNative) lines.push(`Hard cap: native sends over ${maxNative} are blocked.`)
      if (autoUpTo)
        lines.push(`Auto-execute native sends up to ${autoUpTo}; above that requires approval.`)
      if (p.maxSlippageBps !== undefined)
        lines.push(`Swaps over ${p.maxSlippageBps} bps slippage are blocked.`)
      if (p.recipientAllowlist?.length)
        lines.push(`Transfers only to ${p.recipientAllowlist.length} allowlisted recipient(s).`)
      if (p.tokenAllowlist?.length)
        lines.push(`Only ${p.tokenAllowlist.length} allowlisted token(s) may be moved/swapped.`)
      if (p.autonomy === 'confirm') lines.push('Autonomy=confirm: every write needs approval.')

      return {
        ok: true,
        data: {
          enforced: true,
          readOnly,
          autonomy: p.autonomy ?? 'auto',
          maxNativePerTx: maxNative,
          autoApproveUpToNative: autoUpTo,
          approvalAboveAuto: autoUpTo !== null,
          maxSlippageBps: p.maxSlippageBps ?? null,
          recipientAllowlist: p.recipientAllowlist ?? null,
          tokenAllowlist: p.tokenAllowlist ?? null,
          summary:
            lines.length > 0 ? lines.join(' ') : 'Policy armed but with no specific caps set.',
        },
      }
    },
  }
}
