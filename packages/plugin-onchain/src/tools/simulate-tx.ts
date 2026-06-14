/**
 * `tx.simulate` — dry-run any contract call before doing it. Read-only: it
 * never broadcasts. Exposes the same pre-flight simulation engine that guards
 * every write, as a tool the agent (or operator) can point at an arbitrary
 * call to answer "would this succeed, and what would it cost?" up front.
 *
 * Same arg shape as `chain.write` (to + signature + args + value) plus an
 * optional `from` to simulate as another account.
 */

import type { ToolDef } from 'nebula-ai-core'
import { type Address, encodeFunctionData, getAddress, isAddress } from 'viem'
import { z } from 'zod'
import { simulateRawTx } from '../simulate'
import type { OnchainRuntimeContext } from '../types'
import { buildAbiFunction, coerceArg, parseChainWriteValue } from './generic'

const Schema = z.object({
  to: z.string().min(42).describe('0x contract address to call.'),
  signature: z
    .string()
    .optional()
    .describe('Function signature, e.g. "transfer(address,uint256)". Omit if passing raw `data`.'),
  args: z.array(z.unknown()).optional().describe('Args matching the signature.'),
  data: z.string().optional().describe('Raw calldata hex (alternative to signature+args).'),
  value: z
    .string()
    .optional()
    .describe('Native value to attach. Decimal MNT ("0.01") or wei integer.'),
  from: z.string().optional().describe('Account to simulate as (default: the agent EOA).'),
})
type Args = z.infer<typeof Schema>

export function makeTxSimulate(ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'tx.simulate',
    description:
      'Dry-run a contract call WITHOUT broadcasting: returns whether it would succeed and the gas estimate, or the decoded revert reason if it would fail. Pass `to` + `signature` + `args` (like chain.write) or raw `data`, plus optional `value`/`from`. Read-only. Use it to preview an action, debug a revert, or check a call before proposing it.',
    searchHint:
      'simulate dry run preview estimate gas would revert test call before execute eth_estimategas',
    schema: Schema,
    handler: async (args: Args) => {
      try {
        let data: `0x${string}` | undefined
        if (args.signature) {
          const fn = buildAbiFunction(args.signature)
          const coerced = (args.args ?? []).map(coerceArg)
          data = encodeFunctionData({
            abi: [fn] as readonly [import('viem').AbiFunction],
            args: coerced,
          })
        } else if (args.data) {
          data = args.data as `0x${string}`
        } else {
          return { ok: false, error: 'provide either `signature` (+args) or raw `data`' }
        }
        if (!isAddress(args.to)) return { ok: false, error: `invalid address: ${args.to}` }
        const from =
          args.from && isAddress(args.from) ? (getAddress(args.from) as Address) : ctx.agentEoa
        const value = args.value ? parseChainWriteValue(args.value) : undefined

        const sim = await simulateRawTx(ctx.publicClient, {
          account: from,
          to: getAddress(args.to) as Address,
          data,
          value,
        })

        if (sim.ok) {
          return {
            ok: true,
            data: {
              wouldSucceed: true,
              gasEstimate: sim.gas.toString(),
              to: getAddress(args.to),
              from,
              ...(args.signature ? { signature: args.signature } : {}),
              ...(value !== undefined ? { value: value.toString() } : {}),
              note: 'Dry-run only — nothing was broadcast.',
            },
          }
        }
        return {
          ok: true,
          data: {
            wouldSucceed: false,
            revertReason: sim.reason,
            to: getAddress(args.to),
            from,
            note: 'Dry-run only — this call would revert; nothing was broadcast.',
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
