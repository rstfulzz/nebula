/**
 * `account.balance` — full position aggregator.
 *
 * Why this is separate from `account.info`: identity bundles want a small
 * payload; balance questions want every envelope expanded. EOA-only answers
 * under-count by ~10x because compute envelopes (locked in Mantle provider
 * sub-accounts) are usually larger than the EOA itself.
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
  computeLedger: {
    totalWei: string
    availableWei: string
    lockedWei: string
    totalFormatted: string
    availableFormatted: string
    lockedFormatted: string
  } | null
  sandboxBillingReserve: {
    operatorAddress: Address
    wei: string
    formatted: string
  } | null
  positionSummary: {
    mainnetTotalFormatted: string
    testnetTotalFormatted: string
  }
}

export function makeAccountBalance(ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'account.balance',
    description:
      'Full balance: EOA mainnet + EOA testnet + compute ledger total/available/locked + sandbox billing reserve. Read-only, no signer.',
    searchHint:
      'balance position funds compute ledger envelope sandbox billing reserve total — call this for "what\'s my balance" / "how much do we have" / "show full position". Use account.info for identity bundling.',
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
        // Compute-ledger + sandbox-billing reserves were decentralized-compute
        // specific and removed; balance is now the agent EOA's MNT position.
        const result: BalanceResult = {
          agentEoa: ctx.agentEoa,
          eoaMainnet: { wei: eoaMainnetWei.toString(), formatted: formatMnt(eoaMainnetWei) },
          eoaTestnet: { wei: eoaTestnetWei.toString(), formatted: formatMnt(eoaTestnetWei) },
          computeLedger: null,
          sandboxBillingReserve: null,
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
