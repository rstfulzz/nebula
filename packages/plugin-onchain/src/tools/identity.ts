/**
 * `identity.resolve` / `identity.register` — ERC-8004 ("Trustless Agents")
 * on-chain agent identity on Mantle. Lets the agent discover any agent's
 * identity card and register/publish its own.
 */
import {
  type ToolDef,
  agentIdByAddress,
  buildAgentCard,
  cardToDataUri,
  registerAgent,
  resolveAgentById,
  resolveRegistryAddress,
} from 'nebula-ai-core'
import { z } from 'zod'
import type { OnchainRuntimeContext } from '../types'

const ResolveSchema = z.object({
  agentId: z
    .string()
    .optional()
    .describe('Agent id to resolve. Omit (and omit address) to resolve THIS agent by its EOA.'),
  address: z.string().optional().describe('Resolve the agent registered to this EOA (0x...).'),
})
type ResolveArgs = z.infer<typeof ResolveSchema>

export function makeIdentityResolve(ctx: OnchainRuntimeContext): ToolDef<ResolveArgs> {
  return {
    name: 'identity.resolve',
    description:
      'Resolve an ERC-8004 (Trustless Agents) on-chain agent identity on Mantle to its owner, operational address, and agent-card URI. Resolve by agentId, by an EOA via `address`, or (no args) this agent itself. Read-only — call it to discover who/what an agent is before trusting it.',
    searchHint:
      'erc-8004 erc8004 identity registry agent card resolve trustless agent reputation discover who is',
    schema: ResolveSchema,
    handler: async (args: ResolveArgs) => {
      const registry = resolveRegistryAddress(ctx.network)
      if (!registry) {
        return {
          ok: false as const,
          error: `No ERC-8004 Identity Registry deployed for ${ctx.network}. Set NEBULA_IDENTITY_REGISTRY.`,
        }
      }
      try {
        let id: bigint
        if (args.agentId) {
          id = BigInt(args.agentId)
        } else {
          const addr = (args.address ?? ctx.agentEoa) as `0x${string}`
          id = await agentIdByAddress({
            publicClient: ctx.publicClient,
            registry,
            agentAddress: addr,
          })
          if (id === 0n) {
            return { ok: true as const, data: { registered: false, address: addr, registry } }
          }
        }
        const r = await resolveAgentById({ publicClient: ctx.publicClient, registry, agentId: id })
        return {
          ok: true as const,
          data: {
            registered: true,
            agentId: r.agentId.toString(),
            owner: r.owner,
            agentAddress: r.agentAddress,
            cardURI: r.cardURI,
            registry,
            network: ctx.network,
          },
        }
      } catch (e) {
        return { ok: false as const, error: (e as Error).message }
      }
    },
  }
}

const RegisterSchema = z.object({
  name: z
    .string()
    .optional()
    .describe('Display name for the agent card. Defaults to a nebula-<hex> slug.'),
})
type RegisterArgs = z.infer<typeof RegisterSchema>

export function makeIdentityRegister(ctx: OnchainRuntimeContext): ToolDef<RegisterArgs> {
  return {
    name: 'identity.register',
    description:
      "Register THIS agent's own ERC-8004 (Trustless Agents) identity on Mantle: mints a transferable identity NFT to the agent and publishes its agent card (name, endpoints, agent address, skills) as the on-chain tokenURI. One-time; idempotent (no-op if already registered). Costs a little gas. Resolve afterwards with identity.resolve.",
    searchHint:
      'erc-8004 erc8004 register identity mint agent card publish trustless on-chain identity self',
    schema: RegisterSchema,
    handler: async (args: RegisterArgs) => {
      const registry = resolveRegistryAddress(ctx.network)
      if (!registry) {
        return {
          ok: false as const,
          error: `No ERC-8004 Identity Registry deployed for ${ctx.network}. Set NEBULA_IDENTITY_REGISTRY.`,
        }
      }
      if (!ctx.walletClient?.account) {
        return { ok: false as const, error: 'no signer available to register identity' }
      }
      try {
        const agentAddress = ctx.agentEoa
        const existing = await agentIdByAddress({
          publicClient: ctx.publicClient,
          registry,
          agentAddress,
        })
        if (existing !== 0n) {
          return {
            ok: true as const,
            data: { alreadyRegistered: true, agentId: existing.toString(), registry },
          }
        }
        const card = buildAgentCard({
          name: args.name ?? `nebula-${agentAddress.slice(2, 8)}`,
          agentAddress,
          network: ctx.network,
        })
        const { agentId, txHash } = await registerAgent({
          walletClient: ctx.walletClient,
          publicClient: ctx.publicClient,
          registry,
          cardURI: cardToDataUri(card),
          agentAddress,
        })
        return {
          ok: true as const,
          data: { agentId: agentId.toString(), txHash, registry, network: ctx.network },
        }
      } catch (e) {
        return { ok: false as const, error: (e as Error).message }
      }
    },
  }
}
