/**
 * `cex.balance` — read-only Bybit Unified account balance (portfolio view).
 *
 * READ-ONLY by design: no CEX trading/transfers (they'd bypass the on-chain
 * safety pipeline). Keys come from BYBIT_API_KEY / BYBIT_API_SECRET in the env,
 * never committed. Degrades gracefully when keys are unset.
 */

import type { ToolDef } from 'nebula-ai-core'
import { z } from 'zod'
import { fetchBybitBalance } from '../bybit'
import type { OnchainRuntimeContext } from '../types'

const Schema = z.object({})
type Args = z.infer<typeof Schema>

export function makeCexBalance(_ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'cex.balance',
    description:
      'Read-only Bybit Unified account balance (CEX portfolio: per-coin balances + exchange-reported total equity). Lets you show a combined CEX + on-chain treasury picture. Needs BYBIT_API_KEY + BYBIT_API_SECRET in the env. Read-only — this agent never trades or transfers on the CEX (that would bypass the on-chain safety controls).',
    searchHint: 'cex bybit exchange balance portfolio account holdings off-chain unified',
    schema: Schema,
    handler: async () => {
      try {
        const apiKey = process.env.BYBIT_API_KEY
        const apiSecret = process.env.BYBIT_API_SECRET
        if (!apiKey || !apiSecret) {
          return {
            ok: true,
            data: {
              configured: false,
              note: 'BYBIT_API_KEY / BYBIT_API_SECRET not set — CEX balance unavailable. Set them in the env (never commit them); use a READ-ONLY key.',
            },
          }
        }
        const r = await fetchBybitBalance({ apiKey, apiSecret })
        if (!r.ok) return { ok: true, data: { venue: 'Bybit', available: false, note: r.error } }
        return {
          ok: true,
          data: {
            venue: 'Bybit (Unified, read-only)',
            accountType: r.accountType,
            totalEquityUsd: r.totalEquityUsd,
            coins: r.coins,
            note: 'Exchange-reported figures; this agent does not trade or transfer on the CEX.',
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
