/**
 * `chain.block` + `chain.gas` — passive RPC introspection.
 */

import type { ToolDef } from 'nebula-ai-core'
import { getGasPriceWithFloor } from 'nebula-ai-core'
import { formatEther, formatGwei } from 'viem'
import { z } from 'zod'
import type { OnchainRuntimeContext } from '../types'

/** Representative gas units per operation (Mantle), for cost estimates in MNT. */
const TYPICAL_GAS: ReadonlyArray<readonly [string, bigint]> = [
  ['nativeTransfer', 21_000n],
  ['erc20Transfer', 52_000n],
  ['swap', 180_000n],
  ['aaveSupply', 250_000n],
]

const BlockSchema = z.object({
  tag: z
    .union([
      z.enum(['latest', 'finalized', 'safe', 'earliest', 'pending']),
      z.number().int().nonnegative(),
    ])
    .optional()
    .describe('Block tag or number (default: "latest").'),
})
type BlockArgs = z.infer<typeof BlockSchema>

export function makeChainBlock(ctx: OnchainRuntimeContext): ToolDef<BlockArgs> {
  return {
    name: 'chain.block',
    description:
      'Read a Mantle block summary (number, hash, timestamp, txCount, gasUsed). Default: latest.',
    searchHint: 'block number height timestamp head',
    schema: BlockSchema,
    handler: async args => {
      try {
        const tag = args.tag ?? 'latest'
        const block =
          typeof tag === 'number'
            ? await ctx.publicClient.getBlock({ blockNumber: BigInt(tag) })
            : await ctx.publicClient.getBlock({ blockTag: tag })
        return {
          ok: true,
          data: {
            number: Number(block.number ?? 0n),
            hash: block.hash,
            parentHash: block.parentHash,
            timestamp: Number(block.timestamp),
            txCount: block.transactions.length,
            gasUsed: block.gasUsed.toString(),
            gasLimit: block.gasLimit.toString(),
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}

const GasSchema = z.object({})
type GasArgs = z.infer<typeof GasSchema>

export function makeChainGas(ctx: OnchainRuntimeContext): ToolDef<GasArgs> {
  return {
    name: 'chain.gas',
    description:
      'Current Mantle gas price (network 4 gwei floor applied) plus estimated MNT cost of common operations (native/ERC-20 transfer, swap, Aave supply). Use to estimate cost or detect spikes. Costs are in MNT, not USD.',
    searchHint: 'gas price gwei fee estimate cost mnt how much transfer swap',
    schema: GasSchema,
    handler: async () => {
      try {
        const wei = await getGasPriceWithFloor(ctx.publicClient)
        const estimatedCostMnt = Object.fromEntries(
          TYPICAL_GAS.map(([op, units]) => [
            op,
            { gasUnits: Number(units), costMnt: formatEther(wei * units) },
          ]),
        )
        return {
          ok: true,
          data: {
            gasPriceWei: wei.toString(),
            gasPriceGwei: formatGwei(wei),
            estimatedCostMnt,
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
