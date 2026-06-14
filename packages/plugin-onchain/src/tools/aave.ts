/**
 * Aave V3 lending tools on Mantle: aave.position (read), aave.supply, aave.withdraw.
 * Writes run the standard pipeline: policy -> approve (supply) -> simulate -> execute -> receipt.
 */
import type { ToolDef } from 'nebula-ai-core'
import { getGasPriceWithFloor } from 'nebula-ai-core'
import { type Abi, type Address, parseUnits } from 'viem'
import { z } from 'zod'
import {
  AAVE_MAX_WITHDRAW,
  AAVE_V3_POOL_ABI,
  AAVE_VARIABLE_RATE,
  formatBaseUsd,
  formatHealthFactor,
  readAaveAccount,
} from '../aave'
import { ensureAllowance } from '../allowance'
import { AAVE_POOL_BY_NETWORK } from '../constants'
import { evaluatePolicy } from '../policy'
import { simulateContractWrite } from '../simulate'
import { resolveToken } from '../tokens'
import type { OnchainRuntimeContext } from '../types'
import { waitForReceipt } from '../wait-receipt'

function requirePool(ctx: OnchainRuntimeContext): Address {
  const pool = AAVE_POOL_BY_NETWORK[ctx.network]
  if (!pool) throw new Error(`Aave V3 is not deployed on ${ctx.network}`)
  return pool
}

const PositionSchema = z.object({})
type PositionArgs = z.infer<typeof PositionSchema>

export function makeAavePosition(ctx: OnchainRuntimeContext): ToolDef<PositionArgs> {
  return {
    name: 'aave.position',
    description:
      'Read your Aave V3 position on Mantle: total collateral, debt, available borrows, and health factor.',
    searchHint: 'aave lending position health factor collateral debt borrow liquidation',
    schema: PositionSchema,
    handler: async () => {
      try {
        const pool = requirePool(ctx)
        const a = await readAaveAccount(ctx.publicClient, pool, ctx.agentEoa)
        return {
          ok: true,
          data: {
            totalCollateral: formatBaseUsd(a.totalCollateralBase),
            totalDebt: formatBaseUsd(a.totalDebtBase),
            availableBorrows: formatBaseUsd(a.availableBorrowsBase),
            ltvBps: a.ltvBps.toString(),
            liquidationThresholdBps: a.liquidationThresholdBps.toString(),
            healthFactor: formatHealthFactor(a.healthFactorRaw),
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}

const SupplySchema = z.object({
  token: z.string().min(1).describe('ERC-20 symbol or 0x address to supply (e.g. WMNT, USDC).'),
  amount: z.string().min(1).describe('Amount in token units (e.g. "10").'),
})
type SupplyArgs = z.infer<typeof SupplySchema>

export function makeAaveSupply(ctx: OnchainRuntimeContext): ToolDef<SupplyArgs> {
  return {
    name: 'aave.supply',
    description:
      'Supply an ERC-20 to Aave V3 on Mantle (earns yield, becomes collateral). Auto-approves the Pool; policy-checked + simulated before execution.',
    searchHint: 'aave supply deposit lend earn yield collateral',
    schema: SupplySchema,
    handler: async args => {
      try {
        const pool = requirePool(ctx)
        const account = ctx.walletClient.account
        if (!account) return { ok: false, error: 'walletClient has no account; cannot supply' }
        const token = await resolveToken({
          client: ctx.publicClient,
          agentDir: ctx.agentDir,
          input: args.token,
        })
        if (!token) return { ok: false, error: `unknown token: ${args.token}` }
        const amount = parseUnits(args.amount, token.decimals)
        if (ctx.policy) {
          const verdict = evaluatePolicy(
            { kind: 'transfer', asset: token.address, amountRaw: amount },
            ctx.policy,
          )
          if (!verdict.allowed) {
            return { ok: false, error: `policy blocked: ${verdict.violations.join('; ')}` }
          }
        }
        const allow = await ensureAllowance({
          publicClient: ctx.publicClient,
          walletClient: ctx.walletClient,
          token: token.address,
          owner: ctx.agentEoa,
          spender: pool,
          amount,
        })
        const sim = await simulateContractWrite(ctx.publicClient, {
          account: account.address,
          address: pool,
          abi: AAVE_V3_POOL_ABI as Abi,
          functionName: 'supply',
          args: [token.address, amount, ctx.agentEoa, 0],
        })
        if (!sim.ok) return { ok: false, error: `pre-flight simulation reverted: ${sim.reason}` }
        const gasPrice = await getGasPriceWithFloor(ctx.publicClient)
        const txHash = await ctx.walletClient.writeContract({
          address: pool,
          abi: AAVE_V3_POOL_ABI,
          functionName: 'supply',
          args: [token.address, amount, ctx.agentEoa, 0],
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
            token: token.symbol,
            amount: args.amount,
            status: receipt.status === 'success' ? 'success' : 'reverted',
            simGasEstimate: sim.gas.toString(),
            policyEnforced: ctx.policy != null,
            ...(allow.txHash ? { approveTxHash: allow.txHash } : {}),
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}

/** Read the post-tx health factor so the receipt surfaces the risk impact. */
async function healthFactorAfter(ctx: OnchainRuntimeContext, pool: Address): Promise<string> {
  try {
    const a = await readAaveAccount(ctx.publicClient, pool, ctx.agentEoa)
    return formatHealthFactor(a.healthFactorRaw)
  } catch {
    return 'unknown'
  }
}

const BorrowSchema = z.object({
  token: z.string().min(1).describe('ERC-20 symbol or 0x address to borrow (e.g. USDC, USDT).'),
  amount: z.string().min(1).describe('Amount to borrow in token units (e.g. "100").'),
})
type BorrowArgs = z.infer<typeof BorrowSchema>

export function makeAaveBorrow(ctx: OnchainRuntimeContext): ToolDef<BorrowArgs> {
  return {
    name: 'aave.borrow',
    description:
      'Borrow an ERC-20 from Aave V3 on Mantle against your supplied collateral (variable rate). Policy-checked + simulated; Aave reverts a borrow beyond your borrowing power, so the pre-flight simulation catches an over-borrow before any tx. The receipt reports the resulting health factor — the lower it is, the closer to liquidation. Borrowing is leverage: keep it bounded.',
    searchHint: 'aave borrow loan leverage debt against collateral variable rate credit',
    schema: BorrowSchema,
    handler: async args => {
      try {
        const pool = requirePool(ctx)
        const account = ctx.walletClient.account
        if (!account) return { ok: false, error: 'walletClient has no account; cannot borrow' }
        const token = await resolveToken({
          client: ctx.publicClient,
          agentDir: ctx.agentDir,
          input: args.token,
        })
        if (!token) return { ok: false, error: `unknown token: ${args.token}` }
        const amount = parseUnits(args.amount, token.decimals)
        if (ctx.policy) {
          const verdict = evaluatePolicy(
            { kind: 'transfer', asset: token.address, amountRaw: amount },
            ctx.policy,
          )
          if (!verdict.allowed) {
            return { ok: false, error: `policy blocked: ${verdict.violations.join('; ')}` }
          }
        }
        const borrowArgs = [token.address, amount, AAVE_VARIABLE_RATE, 0, ctx.agentEoa] as const
        const sim = await simulateContractWrite(ctx.publicClient, {
          account: account.address,
          address: pool,
          abi: AAVE_V3_POOL_ABI as Abi,
          functionName: 'borrow',
          args: borrowArgs,
        })
        if (!sim.ok) return { ok: false, error: `pre-flight simulation reverted: ${sim.reason}` }
        const gasPrice = await getGasPriceWithFloor(ctx.publicClient)
        const txHash = await ctx.walletClient.writeContract({
          address: pool,
          abi: AAVE_V3_POOL_ABI,
          functionName: 'borrow',
          args: borrowArgs,
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
            token: token.symbol,
            amount: args.amount,
            rateMode: 'variable',
            status: receipt.status === 'success' ? 'success' : 'reverted',
            healthFactorAfter: await healthFactorAfter(ctx, pool),
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

const RepaySchema = z.object({
  token: z.string().min(1).describe('ERC-20 symbol or 0x address of the debt to repay.'),
  amount: z.string().min(1).describe('Amount in token units, or "max" to repay the full debt.'),
})
type RepayArgs = z.infer<typeof RepaySchema>

export function makeAaveRepay(ctx: OnchainRuntimeContext): ToolDef<RepayArgs> {
  return {
    name: 'aave.repay',
    description:
      'Repay an Aave V3 variable-rate debt on Mantle. Use "max" to clear the full debt. Auto-approves the Pool to pull the repayment; policy-checked + simulated. The receipt reports the improved health factor.',
    searchHint: 'aave repay payback debt loan close deleverage',
    schema: RepaySchema,
    handler: async args => {
      try {
        const pool = requirePool(ctx)
        const account = ctx.walletClient.account
        if (!account) return { ok: false, error: 'walletClient has no account; cannot repay' }
        const token = await resolveToken({
          client: ctx.publicClient,
          agentDir: ctx.agentDir,
          input: args.token,
        })
        if (!token) return { ok: false, error: `unknown token: ${args.token}` }
        const isMax = args.amount.toLowerCase() === 'max'
        const amount = isMax ? AAVE_MAX_WITHDRAW : parseUnits(args.amount, token.decimals)
        if (ctx.policy && !isMax) {
          const verdict = evaluatePolicy(
            { kind: 'transfer', asset: token.address, amountRaw: amount },
            ctx.policy,
          )
          if (!verdict.allowed) {
            return { ok: false, error: `policy blocked: ${verdict.violations.join('; ')}` }
          }
        }
        // Approve enough to cover repayment. For "max" we can't know the exact
        // debt cheaply, so approve the uint256 max (Aave pulls only what's owed).
        const allow = await ensureAllowance({
          publicClient: ctx.publicClient,
          walletClient: ctx.walletClient,
          token: token.address,
          owner: ctx.agentEoa,
          spender: pool,
          amount,
        })
        const repayArgs = [token.address, amount, AAVE_VARIABLE_RATE, ctx.agentEoa] as const
        const sim = await simulateContractWrite(ctx.publicClient, {
          account: account.address,
          address: pool,
          abi: AAVE_V3_POOL_ABI as Abi,
          functionName: 'repay',
          args: repayArgs,
        })
        if (!sim.ok) return { ok: false, error: `pre-flight simulation reverted: ${sim.reason}` }
        const gasPrice = await getGasPriceWithFloor(ctx.publicClient)
        const txHash = await ctx.walletClient.writeContract({
          address: pool,
          abi: AAVE_V3_POOL_ABI,
          functionName: 'repay',
          args: repayArgs,
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
            token: token.symbol,
            amount: args.amount,
            status: receipt.status === 'success' ? 'success' : 'reverted',
            healthFactorAfter: await healthFactorAfter(ctx, pool),
            simGasEstimate: sim.gas.toString(),
            policyEnforced: ctx.policy != null,
            ...(allow.txHash ? { approveTxHash: allow.txHash } : {}),
          },
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message.slice(0, 240) }
      }
    },
  }
}

const WithdrawSchema = z.object({
  token: z.string().min(1).describe('ERC-20 symbol or 0x address to withdraw.'),
  amount: z
    .string()
    .min(1)
    .describe('Amount in token units, or "max" for the full supplied balance.'),
})
type WithdrawArgs = z.infer<typeof WithdrawSchema>

export function makeAaveWithdraw(ctx: OnchainRuntimeContext): ToolDef<WithdrawArgs> {
  return {
    name: 'aave.withdraw',
    description:
      'Withdraw a supplied ERC-20 from Aave V3 on Mantle. Use "max" for the full balance. Aave reverts a withdraw that would breach your health factor; the pre-flight simulation surfaces that before any tx.',
    searchHint: 'aave withdraw redeem unwind collateral',
    schema: WithdrawSchema,
    handler: async args => {
      try {
        const pool = requirePool(ctx)
        const account = ctx.walletClient.account
        if (!account) return { ok: false, error: 'walletClient has no account; cannot withdraw' }
        const token = await resolveToken({
          client: ctx.publicClient,
          agentDir: ctx.agentDir,
          input: args.token,
        })
        if (!token) return { ok: false, error: `unknown token: ${args.token}` }
        const amount =
          args.amount.toLowerCase() === 'max'
            ? AAVE_MAX_WITHDRAW
            : parseUnits(args.amount, token.decimals)
        if (ctx.policy && amount !== AAVE_MAX_WITHDRAW) {
          const verdict = evaluatePolicy(
            { kind: 'transfer', asset: token.address, amountRaw: amount },
            ctx.policy,
          )
          if (!verdict.allowed) {
            return { ok: false, error: `policy blocked: ${verdict.violations.join('; ')}` }
          }
        }
        const sim = await simulateContractWrite(ctx.publicClient, {
          account: account.address,
          address: pool,
          abi: AAVE_V3_POOL_ABI as Abi,
          functionName: 'withdraw',
          args: [token.address, amount, ctx.agentEoa],
        })
        if (!sim.ok) return { ok: false, error: `pre-flight simulation reverted: ${sim.reason}` }
        const gasPrice = await getGasPriceWithFloor(ctx.publicClient)
        const txHash = await ctx.walletClient.writeContract({
          address: pool,
          abi: AAVE_V3_POOL_ABI,
          functionName: 'withdraw',
          args: [token.address, amount, ctx.agentEoa],
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
            token: token.symbol,
            amount: args.amount,
            status: receipt.status === 'success' ? 'success' : 'reverted',
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
