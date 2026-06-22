/**
 * Casper agent tools. Each is a plain {name, description, schema, handler} object
 * (structurally a nebula-ai-core ToolDef). Value-moving tools run through
 * policy -> execute -> verify-on-chain.
 */
import { z } from 'zod'
import { PublicKey } from 'casper-js-sdk'
import type { CasperOnchainContext } from './context'
import { getBalanceMotes, waitForExecution, getValidators } from './client'
import { transferCspr } from './transfer'
import { delegate, undelegate, MIN_DELEGATION_CSPR } from './stake'
import { evaluatePolicy } from './policy'
import { motesToCspr, csprToMotes } from './config'

export interface CasperTool<A = any> {
  name: string
  description: string
  searchHint?: string
  schema: z.ZodType<A>
  handler: (args: A) => Promise<{
    ok: boolean
    data?: unknown
    error?: string
    requiresApproval?: boolean
  }>
}

const ok = (data: unknown) => ({ ok: true as const, data })
const fail = (error: string, extra: Record<string, unknown> = {}) => ({ ok: false as const, error, ...extra })

export function makeStatus(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.status',
    description: 'Casper node + network status (chain name, api version) for the active network.',
    searchHint: 'status network node chain casper',
    schema: z.object({}),
    handler: async () => {
      try {
        const s: any = await (ctx.rpc as any).getStatus()
        return ok({
          network: ctx.network.network,
          chainName: ctx.network.chainName,
          rpc: ctx.network.nodeRpc,
          apiVersion: s?.apiVersion ?? s?.api_version,
          chainspec: s?.chainspecName ?? s?.chainspec_name,
        })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeBalance(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.balance',
    description: 'Native CSPR main-purse balance for a public key (defaults to the agent).',
    searchHint: 'balance cspr funds account',
    schema: z.object({
      publicKey: z.string().optional().describe('Hex public key; omit for the agent.'),
    }),
    handler: async (a: any) => {
      try {
        const pub = a.publicKey ? PublicKey.fromHex(a.publicKey) : ctx.pub
        if (!pub) return fail('no public key (set CASPER_SECRET_KEY_PATH or pass publicKey)')
        const motes = await getBalanceMotes(ctx.rpc, pub)
        return ok({ publicKey: pub.toHex(), motes: motes.toString(), cspr: motesToCspr(motes) })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeSend(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.send',
    description:
      'Transfer native CSPR to a recipient public key (min 2.5 CSPR). Policy-gated, then on-chain execution is verified before reporting success.',
    searchHint: 'send transfer pay cspr native',
    schema: z.object({
      to: z.string().min(1).describe('Recipient hex public key.'),
      amount: z.union([z.number(), z.string()]).describe('Amount in CSPR (>= 2.5).'),
      approved: z.boolean().optional().describe('Set true to satisfy an approval-required policy.'),
    }),
    handler: async (a: any) => {
      try {
        const amountMotes = csprToMotes(a.amount)
        if (ctx.policy) {
          const v = evaluatePolicy({ kind: 'transfer', asset: 'native', amountMotes, to: a.to }, ctx.policy)
          if (!v.allowed) return fail(`policy blocked: ${v.violations.join('; ')}`)
          if (v.requiresApproval && !a.approved)
            return fail('requires approval (re-call with approved:true)', { requiresApproval: true })
        }
        if (!ctx.signer) return fail('no signer (set CASPER_SECRET_KEY_PATH)')
        const { hash, explorer } = await transferCspr(ctx.rpc, ctx.signer, { to: a.to, amountCspr: a.amount })
        const status = await waitForExecution(ctx.rpc, hash)
        if (!status.success) return fail(`tx failed: ${status.errorMessage ?? 'unknown'}`, { data: { hash, explorer } })
        return ok({
          hash,
          explorer,
          recipient: a.to,
          amountCspr: Number(a.amount),
          costMotes: status.costMotes,
          policyEnforced: ctx.policy != null,
        })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeValidators(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.validators',
    description: 'List current Casper validators (for staking / earn).',
    searchHint: 'validators stake earn delegate auction',
    schema: z.object({ limit: z.number().optional() }),
    handler: async (a: any) => {
      try {
        return ok({ validators: await getValidators(ctx.rpc, a.limit ?? 10) })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeStake(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.stake',
    description: `Delegate CSPR to a validator to earn staking rewards (min ${MIN_DELEGATION_CSPR} CSPR). Policy-gated + verified.`,
    searchHint: 'stake delegate earn yield rewards',
    schema: z.object({
      validator: z.string().min(1).describe('Validator hex public key.'),
      amount: z.union([z.number(), z.string()]).describe(`CSPR to delegate (>= ${MIN_DELEGATION_CSPR}).`),
      approved: z.boolean().optional(),
    }),
    handler: async (a: any) => {
      try {
        if (Number(a.amount) < MIN_DELEGATION_CSPR)
          return fail(`minimum delegation is ${MIN_DELEGATION_CSPR} CSPR`)
        const amountMotes = csprToMotes(a.amount)
        if (ctx.policy) {
          const v = evaluatePolicy({ kind: 'stake', asset: 'native', amountMotes }, ctx.policy)
          if (!v.allowed) return fail(`policy blocked: ${v.violations.join('; ')}`)
          if (v.requiresApproval && !a.approved)
            return fail('requires approval (re-call with approved:true)', { requiresApproval: true })
        }
        if (!ctx.signer) return fail('no signer (set CASPER_SECRET_KEY_PATH)')
        const hash = await delegate(ctx.rpc, ctx.signer, a.validator, a.amount)
        const status = await waitForExecution(ctx.rpc, hash)
        if (!status.success) return fail(`stake failed: ${status.errorMessage ?? 'unknown'}`, { data: { hash } })
        return ok({
          hash,
          explorer: `${ctx.network.explorer}/transaction/${hash}`,
          validator: a.validator,
          amountCspr: Number(a.amount),
        })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeUnstake(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.unstake',
    description: 'Undelegate (unstake) CSPR from a validator. Policy-gated + verified.',
    searchHint: 'unstake undelegate withdraw stake',
    schema: z.object({
      validator: z.string().min(1),
      amount: z.union([z.number(), z.string()]),
      approved: z.boolean().optional(),
    }),
    handler: async (a: any) => {
      try {
        if (!ctx.signer) return fail('no signer (set CASPER_SECRET_KEY_PATH)')
        const hash = await undelegate(ctx.rpc, ctx.signer, a.validator, a.amount)
        const status = await waitForExecution(ctx.rpc, hash)
        if (!status.success) return fail(`unstake failed: ${status.errorMessage ?? 'unknown'}`, { data: { hash } })
        return ok({
          hash,
          explorer: `${ctx.network.explorer}/transaction/${hash}`,
          validator: a.validator,
          amountCspr: Number(a.amount),
        })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makePolicyShow(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.policy',
    description: 'Show the active deterministic fund-control policy (read-only).',
    searchHint: 'policy guardrail caps limits autonomy',
    schema: z.object({}),
    handler: async () =>
      ok({
        enforced: ctx.policy != null,
        policy: ctx.policy
          ? {
              readOnly: ctx.policy.readOnly ?? false,
              autonomy: ctx.policy.autonomy,
              maxNativeCspr: ctx.policy.maxNativeMotesPerTx
                ? motesToCspr(ctx.policy.maxNativeMotesPerTx)
                : undefined,
              autoMaxNativeCspr: ctx.policy.autoMaxNativeMotesPerTx
                ? motesToCspr(ctx.policy.autoMaxNativeMotesPerTx)
                : undefined,
              recipientAllowlist: ctx.policy.recipientAllowlist,
              tokenAllowlist: ctx.policy.tokenAllowlist,
            }
          : null,
      }),
  }
}
