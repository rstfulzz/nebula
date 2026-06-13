/**
 * `account.balance` — the agent EOA's native MNT position across mainnet and
 * testnet. Kept separate from `account.info` (which bundles identity + tokens
 * + activity): this is the top-line "how much MNT do we hold" answer.
 */

import { NETWORK_RPC, formatMnt } from 'nebula-ai-core'
import type { ToolDef } from 'nebula-ai-core'
import { http, type Address, createPublicClient } from 'viem'
import { z } from 'zod'
import type { OnchainRuntimeContext } from '../types'

const Schema = z.object({})
type Args = z.infer<typeof Schema>

interface BalanceResult {
  agentEoa: Address
  eoaMainnet: { wei: string; formatted: string }
  eoaTestnet: { wei: string; formatted: string }
  positionSummary: {
    mainnetTotalFormatted: string
    testnetTotalFormatted: string
  }
}

export function makeAccountBalance(ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'account.balance',
    description:
      'Agent EOA native MNT balance on both Mantle mainnet and testnet. Read-only, no signer.',
    searchHint:
      'balance position funds MNT total — call this for "what\'s my balance" / "how much do we have" / "show full position". Use account.info for identity + token bundling.',
    schema: Schema,
    handler: async () => {
      try {
        // ctx.publicClient is bound to config.network; explicitly create per-chain
        // clients so an agent on testnet still gets distinct mainnet vs testnet reads.
        const mainnetClient =
          ctx.network === 'mantle-mainnet'
            ? ctx.publicClient
            : createPublicClient({ transport: http(NETWORK_RPC['mantle-mainnet']) })
        const testnetClient =
          ctx.network === 'mantle-testnet'
            ? ctx.publicClient
            : createPublicClient({ transport: http(NETWORK_RPC['mantle-testnet']) })

        const [eoaMainnetWei, eoaTestnetWei] = await Promise.all([
          mainnetClient.getBalance({ address: ctx.agentEoa }).catch(() => 0n),
          testnetClient.getBalance({ address: ctx.agentEoa }).catch(() => 0n),
        ])
        const result: BalanceResult = {
          agentEoa: ctx.agentEoa,
          eoaMainnet: { wei: eoaMainnetWei.toString(), formatted: formatMnt(eoaMainnetWei) },
          eoaTestnet: { wei: eoaTestnetWei.toString(), formatted: formatMnt(eoaTestnetWei) },
          positionSummary: {
            mainnetTotalFormatted: formatMnt(eoaMainnetWei),
            testnetTotalFormatted: formatMnt(eoaTestnetWei),
          },
        }

        return { ok: true, data: result }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
