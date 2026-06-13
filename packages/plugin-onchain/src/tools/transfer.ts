/**
 * `chain.send` — native or ERC-20 transfer.
 */

import type { ToolDef } from 'nebula-ai-core'
import { SANN_SUFFIX, getGasPriceWithFloor, resolveSubnameAddress } from 'nebula-ai-core'
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
  to: z
    .string()
    .min(1)
    .describe(`Recipient 0x address OR \`<name>${SANN_SUFFIX}\` subname (resolved via SANN).`),
  amount: z.string().min(1).describe('Amount in token units (e.g. "0.05" for 0.05 Mantle).'),
  token: z
    .string()
    .optional()
    .describe('Symbol or 0x address. Omit / "Mantle" / "native" for native transfer.'),
})
type Args = z.infer<typeof Schema>

export async function resolveRecipient(to: string, publicClient: PublicClient): Promise<Address> {
  const trimmed = to.trim()
  if (isAddress(trimmed)) return getAddress(trimmed) as Address
  if (trimmed.endsWith(SANN_SUFFIX)) {
    const label = trimmed.slice(0, -SANN_SUFFIX.length)
    if (!label) throw new Error(`empty subname label in ${trimmed}`)
    const addr = await resolveSubnameAddress(publicClient, label)
    if (!addr || !isAddress(addr)) {
      throw new Error(`${trimmed}: address text record empty or invalid`)
    }
    return getAddress(addr) as Address
  }
  throw new Error(
    `cannot resolve recipient "${trimmed}": expected 0x address or *${SANN_SUFFIX} name`,
  )
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
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}
