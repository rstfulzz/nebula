/**
 * ERC-8004 ("Trustless Agents") Reputation + Validation Registry clients.
 *
 * Thin viem wrappers over `NebulaReputationRegistry` (feedback/scores per agent)
 * and `NebulaValidationRegistry` (request/respond validation), both bound to the
 * Identity Registry. Together with erc8004.ts this is the full 3-registry
 * ERC-8004 surface. Addresses resolve from env →  baked-in deployment.
 */
import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import type { NebulaNetwork } from '../config'

// ─── Reputation ──────────────────────────────────────────────────────────────
export const REPUTATION_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'giveFeedback',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'score', type: 'uint8' },
      { name: 'tag', type: 'string' },
      { name: 'uri', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getReputation',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'count', type: 'uint256' },
      { name: 'averageScore', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getFeedback',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [
      { name: 'rater', type: 'address' },
      { name: 'score', type: 'uint8' },
      { name: 'tag', type: 'string' },
      { name: 'uri', type: 'string' },
      { name: 'timestamp', type: 'uint64' },
    ],
  },
] as const

// ─── Validation ──────────────────────────────────────────────────────────────
export const VALIDATION_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'requestValidation',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'dataHash', type: 'bytes32' },
      { name: 'uri', type: 'string' },
    ],
    outputs: [{ name: 'requestId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'respondValidation',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'requestId', type: 'uint256' },
      { name: 'passed', type: 'bool' },
      { name: 'score', type: 'uint8' },
      { name: 'uri', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getValidation',
    stateMutability: 'view',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'agentId', type: 'uint256' },
          { name: 'requester', type: 'address' },
          { name: 'dataHash', type: 'bytes32' },
          { name: 'requestUri', type: 'string' },
          { name: 'validator', type: 'address' },
          { name: 'responded', type: 'bool' },
          { name: 'passed', type: 'bool' },
          { name: 'score', type: 'uint8' },
          { name: 'responseUri', type: 'string' },
          { name: 'requestedAt', type: 'uint64' },
          { name: 'respondedAt', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'totalValidations',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const NEBULA_REPUTATION_REGISTRY: Partial<Record<NebulaNetwork, Address>> = {
  'mantle-mainnet': '0x56b11a8f34eCb20899BD4E1eA539E194F007F361',
  'mantle-testnet': '0x0DA4162BdFaFd0b5a6Da4151E0415aEaBd87B521',
}
export const NEBULA_VALIDATION_REGISTRY: Partial<Record<NebulaNetwork, Address>> = {
  'mantle-mainnet': '0x4A222ec3D7e656ADFE28583219Bed3462973DECD',
  'mantle-testnet': '0x5eDa2Be8c2c24039952751C817a7E9C8E018628e',
}

export function resolveReputationRegistry(
  network: NebulaNetwork,
  override?: string,
): Address | null {
  const c =
    override || process.env.NEBULA_REPUTATION_REGISTRY || NEBULA_REPUTATION_REGISTRY[network]
  return c ? (c as Address) : null
}
export function resolveValidationRegistry(
  network: NebulaNetwork,
  override?: string,
): Address | null {
  const c =
    override || process.env.NEBULA_VALIDATION_REGISTRY || NEBULA_VALIDATION_REGISTRY[network]
  return c ? (c as Address) : null
}

// ─── Reputation client ──
export async function giveFeedback(opts: {
  walletClient: WalletClient
  publicClient: PublicClient
  registry: Address
  agentId: bigint
  score: number
  tag: string
  uri: string
}): Promise<{ txHash: Hex }> {
  const account = opts.walletClient.account
  if (!account) throw new Error('walletClient has no account')
  const { request } = await opts.publicClient.simulateContract({
    address: opts.registry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'giveFeedback',
    args: [opts.agentId, opts.score, opts.tag, opts.uri],
    account,
  })
  const txHash = await opts.walletClient.writeContract(request)
  await opts.publicClient.waitForTransactionReceipt({ hash: txHash })
  return { txHash }
}

export async function getReputation(opts: {
  publicClient: PublicClient
  registry: Address
  agentId: bigint
}): Promise<{ count: bigint; averageScore: bigint }> {
  const [count, averageScore] = (await opts.publicClient.readContract({
    address: opts.registry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'getReputation',
    args: [opts.agentId],
  })) as [bigint, bigint]
  return { count, averageScore }
}

// ─── Validation client ──
export async function requestValidation(opts: {
  walletClient: WalletClient
  publicClient: PublicClient
  registry: Address
  agentId: bigint
  dataHash: Hex
  uri: string
}): Promise<{ requestId: bigint; txHash: Hex }> {
  const account = opts.walletClient.account
  if (!account) throw new Error('walletClient has no account')
  const { request, result } = await opts.publicClient.simulateContract({
    address: opts.registry,
    abi: VALIDATION_REGISTRY_ABI,
    functionName: 'requestValidation',
    args: [opts.agentId, opts.dataHash, opts.uri],
    account,
  })
  const txHash = await opts.walletClient.writeContract(request)
  await opts.publicClient.waitForTransactionReceipt({ hash: txHash })
  return { requestId: result as bigint, txHash }
}

export async function respondValidation(opts: {
  walletClient: WalletClient
  publicClient: PublicClient
  registry: Address
  requestId: bigint
  passed: boolean
  score: number
  uri: string
}): Promise<{ txHash: Hex }> {
  const account = opts.walletClient.account
  if (!account) throw new Error('walletClient has no account')
  const { request } = await opts.publicClient.simulateContract({
    address: opts.registry,
    abi: VALIDATION_REGISTRY_ABI,
    functionName: 'respondValidation',
    args: [opts.requestId, opts.passed, opts.score, opts.uri],
    account,
  })
  const txHash = await opts.walletClient.writeContract(request)
  await opts.publicClient.waitForTransactionReceipt({ hash: txHash })
  return { txHash }
}

export interface ValidationRecord {
  agentId: bigint
  requester: Address
  dataHash: Hex
  requestUri: string
  validator: Address
  responded: boolean
  passed: boolean
  score: number
  responseUri: string
  requestedAt: bigint
  respondedAt: bigint
}

export async function getValidation(opts: {
  publicClient: PublicClient
  registry: Address
  requestId: bigint
}): Promise<ValidationRecord> {
  const v = (await opts.publicClient.readContract({
    address: opts.registry,
    abi: VALIDATION_REGISTRY_ABI,
    functionName: 'getValidation',
    args: [opts.requestId],
  })) as ValidationRecord
  return v
}
