/**
 * ERC-8004 Reputation + Validation brain tools — `reputation.*` and
 * `validation.*`. Lets the agent rate other agents, read reputation, and
 * request/respond/read on-chain validations of agent output.
 */
import {
  type ToolDef,
  agentIdByAddress,
  getReputation,
  getValidation,
  giveFeedback,
  requestValidation,
  resolveRegistryAddress,
  resolveReputationRegistry,
  resolveValidationRegistry,
  respondValidation,
} from 'nebula-ai-core'
import { type Hex, keccak256, toHex } from 'viem'
import { z } from 'zod'
import type { OnchainRuntimeContext } from '../types'

const noRep = (network: string) =>
  ({
    ok: false as const,
    error: `No ERC-8004 Reputation Registry for ${network}. Set NEBULA_REPUTATION_REGISTRY.`,
  }) as const
const noVal = (network: string) =>
  ({
    ok: false as const,
    error: `No ERC-8004 Validation Registry for ${network}. Set NEBULA_VALIDATION_REGISTRY.`,
  }) as const

// ─── reputation.give ──
const GiveSchema = z.object({
  agentId: z.string().describe('The ERC-8004 agent id to rate.'),
  score: z.number().int().min(0).max(100).describe('Score 0–100.'),
  tag: z.string().optional().describe('Short category, e.g. "trade-exec", "accuracy".'),
  uri: z.string().optional().describe('Optional URI to detailed feedback.'),
})
export function makeReputationGive(
  ctx: OnchainRuntimeContext,
): ToolDef<z.infer<typeof GiveSchema>> {
  return {
    name: 'reputation.give',
    description:
      'Record on-chain ERC-8004 reputation feedback about another agent (score 0–100 + tag + optional URI). You cannot rate an agent you own. Writes a tx.',
    searchHint: 'erc-8004 reputation feedback rate review score agent trust give rating',
    schema: GiveSchema,
    handler: async args => {
      const registry = resolveReputationRegistry(ctx.network)
      if (!registry) return noRep(ctx.network)
      if (!ctx.walletClient?.account) return { ok: false as const, error: 'no signer available' }
      try {
        const { txHash } = await giveFeedback({
          walletClient: ctx.walletClient,
          publicClient: ctx.publicClient,
          registry,
          agentId: BigInt(args.agentId),
          score: args.score,
          tag: args.tag ?? '',
          uri: args.uri ?? '',
        })
        return { ok: true as const, data: { txHash, agentId: args.agentId, score: args.score } }
      } catch (e) {
        return { ok: false as const, error: (e as Error).message }
      }
    },
  }
}

// ─── reputation.show ──
const ShowRepSchema = z.object({
  agentId: z.string().optional().describe('Agent id. Or pass `address` to reverse-resolve.'),
  address: z
    .string()
    .optional()
    .describe('Resolve the agent at this EOA, then read its reputation.'),
})
export function makeReputationShow(
  ctx: OnchainRuntimeContext,
): ToolDef<z.infer<typeof ShowRepSchema>> {
  return {
    name: 'reputation.show',
    description:
      "Read an agent's on-chain ERC-8004 reputation: number of ratings + average score (0–100). By agentId or by EOA. Read-only.",
    searchHint: 'erc-8004 reputation read score rating average agent trust reputation lookup',
    schema: ShowRepSchema,
    handler: async args => {
      const registry = resolveReputationRegistry(ctx.network)
      if (!registry) return noRep(ctx.network)
      try {
        let agentId: bigint
        if (args.agentId) agentId = BigInt(args.agentId)
        else {
          const idReg = resolveRegistryAddress(ctx.network)
          if (!idReg)
            return { ok: false as const, error: 'no identity registry to reverse-resolve' }
          agentId = await agentIdByAddress({
            publicClient: ctx.publicClient,
            registry: idReg,
            agentAddress: (args.address ?? ctx.agentEoa) as `0x${string}`,
          })
          if (agentId === 0n) return { ok: true as const, data: { registered: false } }
        }
        const { count, averageScore } = await getReputation({
          publicClient: ctx.publicClient,
          registry,
          agentId,
        })
        return {
          ok: true as const,
          data: {
            agentId: agentId.toString(),
            ratings: count.toString(),
            averageScore: averageScore.toString(),
          },
        }
      } catch (e) {
        return { ok: false as const, error: (e as Error).message }
      }
    },
  }
}

// ─── validation.request ──
const ReqSchema = z.object({
  agentId: z.string().describe('Agent id whose output is being validated.'),
  data: z
    .string()
    .describe('The output/work to validate (hashed on-chain as keccak256), or a 0x32-byte hash.'),
  uri: z.string().optional().describe('Optional URI to the work/context.'),
})
export function makeValidationRequest(
  ctx: OnchainRuntimeContext,
): ToolDef<z.infer<typeof ReqSchema>> {
  return {
    name: 'validation.request',
    description:
      "Open an ERC-8004 validation request for an agent's output. `data` is hashed (keccak256) on-chain as the anchor, or pass a 0x 32-byte hash directly. Returns a requestId. Writes a tx.",
    searchHint: 'erc-8004 validation request verify agent output proof attest validate',
    schema: ReqSchema,
    handler: async args => {
      const registry = resolveValidationRegistry(ctx.network)
      if (!registry) return noVal(ctx.network)
      if (!ctx.walletClient?.account) return { ok: false as const, error: 'no signer available' }
      try {
        const dataHash: Hex = /^0x[0-9a-fA-F]{64}$/.test(args.data)
          ? (args.data as Hex)
          : keccak256(toHex(args.data))
        const { requestId, txHash } = await requestValidation({
          walletClient: ctx.walletClient,
          publicClient: ctx.publicClient,
          registry,
          agentId: BigInt(args.agentId),
          dataHash,
          uri: args.uri ?? '',
        })
        return { ok: true as const, data: { requestId: requestId.toString(), dataHash, txHash } }
      } catch (e) {
        return { ok: false as const, error: (e as Error).message }
      }
    },
  }
}

// ─── validation.respond ──
const RespSchema = z.object({
  requestId: z.string().describe('The validation request id to respond to.'),
  passed: z.boolean().describe('Did the output pass validation?'),
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('Optional 0–100 confidence/quality score.'),
  uri: z.string().optional().describe('Optional URI to the verification artifact.'),
})
export function makeValidationRespond(
  ctx: OnchainRuntimeContext,
): ToolDef<z.infer<typeof RespSchema>> {
  return {
    name: 'validation.respond',
    description:
      'Respond to an ERC-8004 validation request as a validator: pass/fail + optional score + URI. You cannot validate your own request. Writes a tx.',
    searchHint: 'erc-8004 validation respond validator verdict pass fail attest result',
    schema: RespSchema,
    handler: async args => {
      const registry = resolveValidationRegistry(ctx.network)
      if (!registry) return noVal(ctx.network)
      if (!ctx.walletClient?.account) return { ok: false as const, error: 'no signer available' }
      try {
        const { txHash } = await respondValidation({
          walletClient: ctx.walletClient,
          publicClient: ctx.publicClient,
          registry,
          requestId: BigInt(args.requestId),
          passed: args.passed,
          score: args.score ?? 0,
          uri: args.uri ?? '',
        })
        return {
          ok: true as const,
          data: { requestId: args.requestId, passed: args.passed, txHash },
        }
      } catch (e) {
        return { ok: false as const, error: (e as Error).message }
      }
    },
  }
}

// ─── validation.show ──
const ShowValSchema = z.object({
  requestId: z.string().describe('The validation request id to read.'),
})
export function makeValidationShow(
  ctx: OnchainRuntimeContext,
): ToolDef<z.infer<typeof ShowValSchema>> {
  return {
    name: 'validation.show',
    description:
      'Read an ERC-8004 validation request + its response (requester, validator, pass/fail, score, dataHash). Read-only.',
    searchHint: 'erc-8004 validation read result status verdict request lookup',
    schema: ShowValSchema,
    handler: async args => {
      const registry = resolveValidationRegistry(ctx.network)
      if (!registry) return noVal(ctx.network)
      try {
        const v = await getValidation({
          publicClient: ctx.publicClient,
          registry,
          requestId: BigInt(args.requestId),
        })
        return {
          ok: true as const,
          data: {
            requestId: args.requestId,
            agentId: v.agentId.toString(),
            requester: v.requester,
            validator: v.validator,
            responded: v.responded,
            passed: v.passed,
            score: v.score,
            dataHash: v.dataHash,
            requestUri: v.requestUri,
            responseUri: v.responseUri,
          },
        }
      } catch (e) {
        return { ok: false as const, error: (e as Error).message }
      }
    },
  }
}
