/**
 * `chain.wrap` + `chain.unwrap` — native MNT ↔ WMNT via WETH9 deposit/withdraw.
 */

import type { ToolDef } from 'nebula-ai-core'
import { getGasPriceWithFloor } from 'nebula-ai-core'
import { type Address, formatEther, parseEther } from 'viem'
import { z } from 'zod'
import { WETH9_ABI } from '../abis'
import { AGNI_BY_NETWORK, requireMainnet } from '../constants'
import type { OnchainRuntimeContext } from '../types'
import { waitForReceipt } from '../wait-receipt'

const WrapSchema = z.object({
  amount: z.string().min(1).describe('Amount of MNT to wrap (e.g. "0.05").'),
})
type WrapArgs = z.infer<typeof WrapSchema>

export function makeChainWrap(ctx: OnchainRuntimeContext): ToolDef<WrapArgs> {
  return {
    name: 'chain.wrap',
    description:
      'Wrap native MNT into WMNT (ERC-20). Calls WMNT.deposit() with msg.value. Required when the agent needs to swap with ERC-20 input on Agni.',
    searchHint: 'wrap wmnt weth deposit erc20 mnt',
    schema: WrapSchema,
    handler: async args => {
      try {
        requireMainnet(ctx.network)
        const wmnt = AGNI_BY_NETWORK[ctx.network]!.weth9
        const account = ctx.walletClient.account
        if (!account) {
          return { ok: false, error: 'walletClient has no account; cannot wrap' }
        }
        const value = parseEther(args.amount)
        const gasPrice = await getGasPriceWithFloor(ctx.publicClient)
        const txHash = await ctx.walletClient.writeContract({
          address: wmnt as Address,
          abi: WETH9_ABI,
          functionName: 'deposit',
          value,
          chain: ctx.walletClient.chain,
          account,
          gasPrice,
        })
        const receipt = await waitForReceipt(ctx.publicClient, txHash)
        const wmntBal = (await ctx.publicClient.readContract({
          address: wmnt as Address,
          abi: WETH9_ABI,
          functionName: 'balanceOf',
          args: [ctx.agentEoa],
        })) as bigint
        const nativeBal = await ctx.publicClient.getBalance({ address: ctx.agentEoa })
        return {
          ok: true,
          data: {
            txHash,
            blockNumber: Number(receipt.blockNumber),
            gasUsed: receipt.gasUsed.toString(),
            wrappedAmount: args.amount,
            wmntBalance: formatEther(wmntBal),
            nativeBalance: formatEther(nativeBal),
            status: receipt.status === 'success' ? 'success' : 'reverted',
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}

const UnwrapSchema = z.object({
  amount: z.string().min(1).describe('Amount of WMNT to unwrap, or "all" for entire WMNT balance.'),
})
type UnwrapArgs = z.infer<typeof UnwrapSchema>

export function makeChainUnwrap(ctx: OnchainRuntimeContext): ToolDef<UnwrapArgs> {
  return {
    name: 'chain.unwrap',
    description:
      'Unwrap WMNT back into native MNT. Calls WMNT.withdraw(amount). Pass "all" to unwrap entire balance.',
    searchHint: 'unwrap wmnt native withdraw mnt',
    schema: UnwrapSchema,
    handler: async args => {
      try {
        requireMainnet(ctx.network)
        const wmnt = AGNI_BY_NETWORK[ctx.network]!.weth9
        const account = ctx.walletClient.account
        if (!account) {
          return { ok: false, error: 'walletClient has no account; cannot unwrap' }
        }
        let amountWei: bigint
        if (args.amount === 'all') {
          amountWei = (await ctx.publicClient.readContract({
            address: wmnt as Address,
            abi: WETH9_ABI,
            functionName: 'balanceOf',
            args: [ctx.agentEoa],
          })) as bigint
          if (amountWei === 0n) {
            return { ok: false, error: 'no WMNT balance to unwrap' }
          }
        } else {
          amountWei = parseEther(args.amount)
        }
        const gasPrice = await getGasPriceWithFloor(ctx.publicClient)
        const txHash = await ctx.walletClient.writeContract({
          address: wmnt as Address,
          abi: WETH9_ABI,
          functionName: 'withdraw',
          args: [amountWei],
          chain: ctx.walletClient.chain,
          account,
          gasPrice,
        })
        const receipt = await waitForReceipt(ctx.publicClient, txHash)
        const wmntBal = (await ctx.publicClient.readContract({
          address: wmnt as Address,
          abi: WETH9_ABI,
          functionName: 'balanceOf',
          args: [ctx.agentEoa],
        })) as bigint
        const nativeBal = await ctx.publicClient.getBalance({ address: ctx.agentEoa })
        return {
          ok: true,
          data: {
            txHash,
            blockNumber: Number(receipt.blockNumber),
            gasUsed: receipt.gasUsed.toString(),
            unwrappedAmount: formatEther(amountWei),
            wmntBalance: formatEther(wmntBal),
            nativeBalance: formatEther(nativeBal),
            status: receipt.status === 'success' ? 'success' : 'reverted',
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
