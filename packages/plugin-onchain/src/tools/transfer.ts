/**
 * `chain.send` — native or ERC-20 transfer.
 */

import type { ToolDef } from 'nebula-ai-core'
import { getGasPriceWithFloor } from 'nebula-ai-core'
import {
  type Abi,
  type Address,
  type PublicClient,
  getAddress,
  isAddress,
  parseEther,
  parseUnits,
} from 'viem'
import { z } from 'zod'
import { ERC20_ABI } from '../abis'
import { evaluatePolicy } from '../policy'
import { simulateContractWrite, simulateNativeSend } from '../simulate'
import { isNativeToken, resolveToken } from '../tokens'
import type { OnchainRuntimeContext } from '../types'
import { waitForReceipt } from '../wait-receipt'

const Schema = z.object({
  to: z.string().min(1).describe('Recipient 0x address.'),
  amount: z.string().min(1).describe('Amount in token units (e.g. "0.05" for 0.05 MNT).'),
  token: z
    .string()
    .optional()
    .describe('Symbol or 0x address. Omit / "MNT" / "native" for native transfer.'),
})
type Args = z.infer<typeof Schema>

// Recipient resolution is 0x-only on Mantle. (Nebula does not depend on an
// on-chain name service; pass a checksummed/lowercase 0x address.)
export async function resolveRecipient(to: string, _publicClient: PublicClient): Promise<Address> {
  const trimmed = to.trim()
  if (isAddress(trimmed)) return getAddress(trimmed) as Address
  throw new Error(`cannot resolve recipient "${trimmed}": expected a 0x address`)
}

export function makeChainSend(ctx: OnchainRuntimeContext): ToolDef<Args> {
  return {
    name: 'chain.send',
    description:
      'Transfer Mantle or any ERC-20 from your agent EOA. Pass `token` for ERC-20; omit for native Mantle. Auto-detects decimals via tokens.info.',
    searchHint: 'send transfer 0g native erc20 pay',
    schema: Schema,
    handler: async args => {
      try {
        const recipient = await resolveRecipient(args.to, ctx.publicClient)
        const account = ctx.walletClient.account
        if (!account) {
          return { ok: false, error: 'walletClient has no account; cannot send' }
        }
        const gasPrice = await getGasPriceWithFloor(ctx.publicClient)
        if (isNativeToken(args.token)) {
          const value = parseEther(args.amount)
          // Policy gate (deterministic): block before simulate/execute.
          if (ctx.policy) {
            const verdict = evaluatePolicy(
              { kind: 'transfer', asset: 'native', amountRaw: value, to: recipient },
              ctx.policy,
            )
            if (!verdict.allowed) {
              return { ok: false, error: `policy blocked: ${verdict.violations.join('; ')}` }
            }
          }
          // Simulate-before-write: dry-run against the chain; abort if it would revert.
          const sim = await simulateNativeSend(ctx.publicClient, {
            account: account.address,
            to: recipient,
            value,
          })
          if (!sim.ok) {
            return { ok: false, error: `pre-flight simulation reverted: ${sim.reason}` }
          }
          const txHash = await ctx.walletClient.sendTransaction({
            to: recipient,
            value,
            chain: ctx.walletClient.chain,
            account,
            gasPrice,
          })
          const receipt = await waitForReceipt(ctx.publicClient, txHash)
          return {
            ok: true,
            data: {
              txHash,
              blockNumber: Number(receipt.blockNumber),
              gasUsed: receipt.gasUsed.toString(),
              token: 'Mantle',
              amount: args.amount,
              recipient,
              status: receipt.status === 'success' ? 'success' : 'reverted',
              // Decision receipt: proof this write was policy-checked + simulated.
              simGasEstimate: sim.gas.toString(),
              policyEnforced: ctx.policy != null,
            },
          }
        }
        const token = await resolveToken({
          client: ctx.publicClient,
          agentDir: ctx.agentDir,
          input: args.token!,
        })
        if (!token) {
          return { ok: false, error: `unknown token: ${args.token}` }
        }
        const value = parseUnits(args.amount, token.decimals)
        // Policy gate (deterministic): block before simulate/execute.
        if (ctx.policy) {
          const verdict = evaluatePolicy(
            { kind: 'transfer', asset: token.address, amountRaw: value, to: recipient },
            ctx.policy,
          )
          if (!verdict.allowed) {
            return { ok: false, error: `policy blocked: ${verdict.violations.join('; ')}` }
          }
        }
        // Simulate-before-write: dry-run the ERC-20 transfer; abort if it would revert.
        const sim = await simulateContractWrite(ctx.publicClient, {
          account: account.address,
          address: token.address,
          abi: ERC20_ABI as Abi,
          functionName: 'transfer',
          args: [recipient, value],
        })
        if (!sim.ok) {
          return { ok: false, error: `pre-flight simulation reverted: ${sim.reason}` }
        }
        const txHash = await ctx.walletClient.writeContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipient, value],
          chain: ctx.walletClient.chain,
          account,
          gasPrice,
        })
        const receipt = await waitForReceipt(ctx.publicClient, txHash)
        return {
          ok: true,
          data: {
            txHash,
            blockNumber: Number(receipt.blockNumber),
            gasUsed: receipt.gasUsed.toString(),
            token: token.symbol,
            tokenAddress: token.address,
            amount: args.amount,
            amountRaw: value.toString(),
            recipient,
            status: receipt.status === 'success' ? 'success' : 'reverted',
            // Decision receipt: proof this write was policy-checked + simulated.
            simGasEstimate: sim.gas.toString(),
            policyEnforced: ctx.policy != null,
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
