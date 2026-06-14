/**
 * `nansen.labels` — Nansen address intelligence for counterparty vetting.
 * Read-only. Requires NANSEN_API_KEY in the environment (never committed);
 * surfaces a clear message when the key is unset or out of credits.
 */

import type { ToolDef } from 'nebula-ai-core'
import { z } from 'zod'
import { categorySummary, fetchNansenLabels, redFlags } from '../nansen'
import type { OnchainRuntimeContext } from '../types'

const Schema = z.object({
  address: z.string().min(1).describe('0x address to look up.'),
  chain: z
    .string()
    .optional()
    .describe('Chain to query (e.g. "ethereum", "mantle"). Default "ethereum".'),
})
type Args = z.infer<typeof Schema>

export function makeNansenLabels(_ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'nansen.labels',
    description:
      'Nansen entity labels for an address (exchange / fund / smart-money / contract / and red-flag categories like scam, hack, sanctioned, mixer) — vet a counterparty before transacting. Read-only; needs NANSEN_API_KEY in the env. Reports a flagged warning when the address carries a red-flag label.',
    searchHint:
      'nansen address labels entity intel exchange smart money scam sanctioned counterparty vet who is',
    schema: Schema,
    handler: async (args: Args) => {
      try {
        const apiKey = process.env.NANSEN_API_KEY
        if (!apiKey) {
          return {
            ok: true,
            data: {
              configured: false,
              note: 'NANSEN_API_KEY is not set — counterparty intel unavailable. Set it in the env (never commit it) to enable nansen.labels.',
            },
          }
        }
        const chain = args.chain ?? 'ethereum'
        const res = await fetchNansenLabels({ address: args.address, chain, apiKey })
        if (!res.ok) {
          return {
            ok: true,
            data: { address: args.address, chain, available: false, note: res.error },
          }
        }
        const flags = redFlags(res.labels)
        return {
          ok: true,
          data: {
            address: args.address,
            chain,
            labelCount: res.labels.length,
            categories: categorySummary(res.labels),
            labels: res.labels.slice(0, 25),
            flagged: flags.length > 0,
            ...(flags.length > 0
              ? {
                  warning: `RED FLAG: address carries Nansen label(s) in [${flags.join(', ')}] — do not transact without confirmation`,
                }
              : {}),
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
