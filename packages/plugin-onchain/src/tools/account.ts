/**
 * `account.info` — wallet + iNFT + brain + activity bundle in one call.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ToolDef } from 'nebula-ai-core'
import type { Address } from 'viem'
import { z } from 'zod'
import { snapshotBalances } from '../balances'
import { AGNI_BY_NETWORK } from '../constants'
import { type PricedToken, resolveUsdPrices } from '../pricing'
import type { OnchainRuntimeContext } from '../types'

const Schema = z.object({})
type Args = z.infer<typeof Schema>

const round2 = (n: number): number => Math.round(n * 100) / 100

export function makeAccountInfo(ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'account.info',
    description:
      'Bundle of agent wallet snapshot (with USD values + total wallet worth) + iNFT identity + brain provider + last 5 activity entries. Pricing is best-effort (free DeFiLlama + on-chain fallback); amounts always returned.',
    searchHint: 'identity wallet snapshot account info self worth usd value holdings',
    schema: Schema,
    handler: async () => {
      try {
        const [snap, recent] = await Promise.all([
          snapshotBalances({
            client: ctx.publicClient,
            agentDir: ctx.agentDir,
            address: ctx.agentEoa,
            mintBlock: ctx.mintBlock,
          }),
          readRecentActivity(ctx.agentDir, 5),
        ])

        // Best-effort USD valuation via the free pricing (DeFiLlama + on-chain
        // Agni fallback). If pricing is unavailable, amounts are still returned.
        const wmnt = AGNI_BY_NETWORK[ctx.network]?.weth9 as Address | undefined
        const priced = await resolveUsdPrices({
          client: ctx.publicClient,
          mainnet: ctx.network === 'mantle-mainnet',
          tokens: [
            ...(wmnt ? [{ address: wmnt, symbol: 'WMNT', decimals: 18 }] : []),
            ...snap.tokens
              .filter(t => Number(t.formatted) > 0)
              .map(t => ({ address: t.address, symbol: t.symbol, decimals: t.decimals })),
          ],
          wmnt,
        }).catch(() => ({}) as Record<string, PricedToken>)
        const priceOf = (addr: string): number | null =>
          priced[addr.toLowerCase()]?.priceUsd ?? null

        const nativePrice = wmnt ? priceOf(wmnt) : null
        const nativeUsd =
          nativePrice !== null ? round2(Number(snap.native.formatted) * nativePrice) : null
        const tokens = snap.tokens.map(t => {
          const price = priceOf(t.address)
          return {
            symbol: t.symbol,
            address: t.address,
            decimals: t.decimals,
            raw: t.raw,
            formatted: t.formatted,
            usdValue: price !== null ? round2(Number(t.formatted) * price) : null,
          }
        })
        const totalWalletUsd = round2(
          (nativeUsd ?? 0) + tokens.reduce((s, t) => s + (t.usdValue ?? 0), 0),
        )

        return {
          ok: true,
          data: {
            agentEoa: ctx.agentEoa,
            iNFT: ctx.iNFT
              ? {
                  contract: ctx.iNFT.contract,
                  tokenId: ctx.iNFT.tokenId.toString(),
                }
              : null,
            network: ctx.network,
            brain: { provider: ctx.brainProvider ?? null, model: ctx.brainModel ?? null },
            wallet: {
              native: { ...snap.native, usdValue: nativeUsd },
              tokens,
              totalWalletUsd,
              blockNumber: snap.blockNumber,
            },
            recentActivity: recent,
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}

interface ActivityEntry {
  ts: number
  kind: string
  summary: string
}

function readRecentActivity(agentDir: string, limit: number): ActivityEntry[] {
  const path = join(agentDir, 'activity.jsonl')
  if (!existsSync(path)) return []
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  const lines = raw.split('\n').filter(Boolean)
  const tail = lines.slice(-limit)
  const out: ActivityEntry[] = []
  for (const line of tail) {
    try {
      const obj = JSON.parse(line) as { ts?: number; kind?: string; data?: unknown }
      if (typeof obj.ts === 'number' && typeof obj.kind === 'string') {
        out.push({
          ts: obj.ts,
          kind: obj.kind,
          summary: summarizeActivity(obj),
        })
      }
    } catch {
      // ignore malformed
    }
  }
  return out
}

function summarizeActivity(obj: { kind?: string; data?: unknown }): string {
  if (obj.kind === 'tool-call' && obj.data && typeof obj.data === 'object') {
    const data = obj.data as { call?: { name?: string } }
    return data.call?.name ?? 'tool'
  }
  if (typeof obj.kind === 'string') return obj.kind
  return 'event'
}
