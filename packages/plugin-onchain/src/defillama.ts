/**
 * DeFiLlama yield discovery for Mantle.
 *
 * Per the project rule (CLAUDE.md), DeFiLlama is used for ANALYTICS and
 * DISCOVERY only — never for execution. This module fetches the public yields
 * feed, filters to Mantle, and annotates each pool with the risk signals a
 * treasury assistant needs: stablecoin / impermanent-loss / single-vs-multi
 * exposure, and whether the asset is a RESTRICTED product (MI4, USDY, mUSD)
 * that must not be entered without explicit eligibility confirmation.
 *
 * No API key. The endpoint is GET-only and unauthenticated.
 */

export const DEFILLAMA_YIELDS_URL = 'https://yields.llama.fi/pools'

/** Assets the project treats as restricted (CLAUDE.md). Discovery surfaces them but flags them. */
const RESTRICTED_PATTERNS: ReadonlyArray<RegExp> = [/\bUSDY\b/i, /\bMI4\b/i, /\bmUSD\b/i]

export function isRestrictedAsset(symbol: string, project: string): boolean {
  const hay = `${symbol} ${project}`
  return RESTRICTED_PATTERNS.some(re => re.test(hay))
}

export interface YieldPool {
  /** DeFiLlama protocol slug, e.g. "aave-v3", "agni", "merchant-moe". */
  project: string
  /** Pool asset symbol, e.g. "USDC", "WMNT-USDC". */
  symbol: string
  /** DeFiLlama pool id (opaque). */
  pool: string
  tvlUsd: number
  /** Total APY (base + reward), percent. */
  apy: number
  apyBase: number | null
  apyReward: number | null
  /** 7-day APY change in percentage points (momentum signal). */
  apyPct7D: number | null
  /** True when both legs are stablecoins. */
  stablecoin: boolean
  /** "no" | "yes" — impermanent-loss risk per DeFiLlama. */
  ilRisk: string
  /** "single" | "multi" — token exposure. */
  exposure: string
  poolMeta: string | null
  /** CLAUDE.md restricted product (USDY/MI4/mUSD) — needs eligibility confirmation. */
  restricted: boolean
}

interface RawPool {
  chain?: string
  project?: string
  symbol?: string
  pool?: string
  tvlUsd?: number
  apy?: number
  apyBase?: number | null
  apyReward?: number | null
  apyPct7D?: number | null
  stablecoin?: boolean
  ilRisk?: string
  exposure?: string
  poolMeta?: string | null
}

function toYieldPool(p: RawPool): YieldPool {
  const symbol = p.symbol ?? '?'
  const project = p.project ?? '?'
  return {
    project,
    symbol,
    pool: p.pool ?? '',
    tvlUsd: p.tvlUsd ?? 0,
    apy: p.apy ?? 0,
    apyBase: p.apyBase ?? null,
    apyReward: p.apyReward ?? null,
    apyPct7D: p.apyPct7D ?? null,
    stablecoin: p.stablecoin ?? false,
    ilRisk: p.ilRisk ?? 'unknown',
    exposure: p.exposure ?? 'unknown',
    poolMeta: p.poolMeta ?? null,
    restricted: isRestrictedAsset(symbol, project),
  }
}

export interface FetchYieldsOpts {
  /** Minimum pool TVL in USD (filters dust). Default 50_000. */
  minTvlUsd?: number
  /** Only stablecoin pools (lower-risk treasury parking). */
  stableOnly?: boolean
  /** Exclude pools with impermanent-loss risk. */
  noIlRisk?: boolean
  /** Filter to a single protocol slug substring (e.g. "aave"). */
  project?: string
  /** Sort key. Default "apy". */
  sortBy?: 'apy' | 'tvl'
  /** Max rows. Default 10, hard-capped at 50. */
  limit?: number
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch
}

/**
 * Fetch + filter + rank Mantle yield pools. Pure aside from the single GET.
 */
export async function fetchMantleYields(opts: FetchYieldsOpts = {}): Promise<YieldPool[]> {
  const f = opts.fetchImpl ?? fetch
  const res = await f(DEFILLAMA_YIELDS_URL)
  if (!res.ok) throw new Error(`DeFiLlama yields API ${res.status}`)
  const json = (await res.json()) as { status?: string; data?: RawPool[] }
  const all = json.data ?? []
  let pools = all.filter(p => p.chain === 'Mantle').map(toYieldPool)

  const minTvl = opts.minTvlUsd ?? 50_000
  pools = pools.filter(p => p.tvlUsd >= minTvl)
  if (opts.stableOnly) pools = pools.filter(p => p.stablecoin)
  if (opts.noIlRisk) pools = pools.filter(p => p.ilRisk !== 'yes')
  if (opts.project) {
    const needle = opts.project.toLowerCase()
    pools = pools.filter(p => p.project.toLowerCase().includes(needle))
  }

  const key = opts.sortBy === 'tvl' ? (p: YieldPool) => p.tvlUsd : (p: YieldPool) => p.apy
  pools.sort((a, b) => key(b) - key(a))

  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50)
  return pools.slice(0, limit)
}
