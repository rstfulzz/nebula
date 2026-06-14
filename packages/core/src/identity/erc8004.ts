/**
 * ERC-8004 ("Trustless Agents") Identity Registry client.
 *
 * Thin viem wrapper over the on-chain `NebulaIdentityRegistry` (see
 * contracts/src/NebulaIdentityRegistry.sol). Each agent owns a transferable
 * ERC-721 identity whose tokenURI is the agent card. Register, resolve, and
 * reverse-resolve (agent EOA → id).
 *
 * The registry address is supplied per call (the CLI/tools read it from
 * `NEBULA_IDENTITY_REGISTRY` or config). No canonical Mantle deployment is
 * baked in yet — run `contracts/script/DeployIdentityRegistry.s.sol` and set
 * the env var.
 */
import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import type { NebulaNetwork } from '../config'

export const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'cardURI', type: 'string' },
      { name: 'agentAddress', type: 'address' },
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'setAgentCard',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'cardURI', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'resolve',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'agentAddress', type: 'address' },
      { name: 'cardURI', type: 'string' },
    ],
  },
  {
    type: 'function',
    name: 'agentIdByAddress',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'owner', type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenURI',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'totalAgents',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'agentAddress', type: 'address', indexed: true },
      { name: 'cardURI', type: 'string', indexed: false },
    ],
  },
] as const

/**
 * Deployed registry addresses per network. Override at runtime with
 * NEBULA_IDENTITY_REGISTRY. Mainnet pending a funded deploy.
 */
export const NEBULA_IDENTITY_REGISTRY: Partial<Record<NebulaNetwork, Address>> = {
  'mantle-mainnet': '0x00a818451dC072d449e92a21d02d6B68fc703588',
  'mantle-testnet': '0x529ae7B0e8A8191c0307b918AA62f1Fc6557a621',
}

/** Resolve the registry address: explicit override → env → baked-in. null if unset. */
export function resolveRegistryAddress(network: NebulaNetwork, override?: string): Address | null {
  const candidate =
    override || process.env.NEBULA_IDENTITY_REGISTRY || NEBULA_IDENTITY_REGISTRY[network]
  if (!candidate) return null
  return candidate as Address
}

export interface ResolvedAgent {
  agentId: bigint
  owner: Address
  agentAddress: Address
  cardURI: string
}

/** Register a new agent identity. Returns the minted agentId + tx hash. */
export async function registerAgent(opts: {
  walletClient: WalletClient
  publicClient: PublicClient
  registry: Address
  cardURI: string
  agentAddress: Address
}): Promise<{ agentId: bigint; txHash: Hex }> {
  const account = opts.walletClient.account
  if (!account) throw new Error('walletClient has no account')
  const { request, result } = await opts.publicClient.simulateContract({
    address: opts.registry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: [opts.cardURI, opts.agentAddress],
    account,
  })
  const txHash = await opts.walletClient.writeContract(request)
  await opts.publicClient.waitForTransactionReceipt({ hash: txHash })
  return { agentId: result as bigint, txHash }
}

/** Resolve an agent id → owner, operational address, card URI. */
export async function resolveAgentById(opts: {
  publicClient: PublicClient
  registry: Address
  agentId: bigint
}): Promise<ResolvedAgent> {
  const [owner, agentAddress, cardURI] = (await opts.publicClient.readContract({
    address: opts.registry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'resolve',
    args: [opts.agentId],
  })) as [Address, Address, string]
  return { agentId: opts.agentId, owner, agentAddress, cardURI }
}

/** Reverse-resolve: agent operational EOA → agentId (0n if not registered). */
export async function agentIdByAddress(opts: {
  publicClient: PublicClient
  registry: Address
  agentAddress: Address
}): Promise<bigint> {
  return (await opts.publicClient.readContract({
    address: opts.registry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'agentIdByAddress',
    args: [opts.agentAddress],
  })) as bigint
}
