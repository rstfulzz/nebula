/**
 * `defi.yields` — discover Mantle yield opportunities via DeFiLlama (analytics
 * + discovery only; never execution, per CLAUDE.md). Read-only: no signer, no
 * policy/simulation gate. Restricted products (USDY/MI4/mUSD) are surfaced but
 * flagged so the brain proposes them only with eligibility confirmation.
 */

import type { ToolDef } from 'nebula-ai-core'
import { z } from 'zod'
import { fetchMantleYields } from '../defillama'
import type { OnchainRuntimeContext } from '../types'

const Schema = z.object({
  minTvlUsd: z
    .number()
    .optional()
    .describe('Minimum pool TVL in USD (filters illiquid pools). Default 50000.'),
  stableOnly: z
    .boolean()
    .optional()
    .describe('Only stablecoin pools — lower-risk treasury parking. Default false.'),
  noIlRisk: z
    .boolean()
    .optional()
    .describe('Exclude pools flagged with impermanent-loss risk. Default false.'),
  project: z
    .string()
    .optional()
    .describe('Filter to a protocol slug substring, e.g. "aave", "agni", "merchant-moe".'),
  sortBy: z.enum(['apy', 'tvl']).optional().describe('Rank by APY (default) or TVL.'),
  limit: z.number().optional().describe('Max rows (1-50). Default 10.'),
})
type Args = z.infer<typeof Schema>

export function makeDefiYields(_ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'defi.yields',
    description:
      'Discover Mantle yield opportunities (lending + LP pools) ranked by APY or TVL, via DeFiLlama. Each row carries risk signals: stablecoin, impermanent-loss risk, single/multi exposure, 7d APY trend, and a `restricted` flag for products that need eligibility confirmation (USDY/MI4/mUSD). Analytics + discovery ONLY — does not execute anything. Use for "best yields on Mantle", "where can I park USDC", "safe stablecoin yield".',
    searchHint:
      'defi yield apy pool discover farm lend stablecoin tvl mantle defillama best return',
    schema: Schema,
    handler: async (args: Args) => {
      try {
        const pools = await fetchMantleYields({
          minTvlUsd: args.minTvlUsd,
          stableOnly: args.stableOnly,
          noIlRisk: args.noIlRisk,
          project: args.project,
          sortBy: args.sortBy,
          limit: args.limit,
        })
        return {
          ok: true,
          data: {
            chain: 'Mantle',
            source: 'DeFiLlama (analytics/discovery only — not executable)',
            count: pools.length,
            restrictedNote:
              pools.some(p => p.restricted) === true
                ? 'Some results are RESTRICTED products (USDY/MI4/mUSD); confirm eligibility before proposing entry.'
                : undefined,
            pools: pools.map(p => ({
              project: p.project,
              symbol: p.symbol,
              apy: Number(p.apy.toFixed(2)),
              apyBase: p.apyBase === null ? null : Number(p.apyBase.toFixed(2)),
              apyReward: p.apyReward === null ? null : Number(p.apyReward.toFixed(2)),
              apy7dTrend: p.apyPct7D === null ? null : Number(p.apyPct7D.toFixed(2)),
              tvlUsd: Math.round(p.tvlUsd),
              stablecoin: p.stablecoin,
              ilRisk: p.ilRisk,
              exposure: p.exposure,
              restricted: p.restricted,
            })),
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
