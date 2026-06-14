// Browser reader for the ERC-8004 (Trustless Agents) registries on Mantle:
// Identity + Reputation + Validation. Replaces the legacy iNFT/SANN reader.

import { type Address, type Hex, type PublicClient, parseAbiItem } from 'viem'

export type ChainId = 5000 | 5003

export const ERC8004_REGISTRIES: Record<
  ChainId,
  { identity: Address; reputation: Address; validation: Address; fromBlock: bigint }
> = {
  5000: {
    identity: '0x00a818451dC072d449e92a21d02d6B68fc703588',
    reputation: '0x56b11a8f34eCb20899BD4E1eA539E194F007F361',
    validation: '0x4A222ec3D7e656ADFE28583219Bed3462973DECD',
    fromBlock: 96_653_564n,
  },
  5003: {
    identity: '0x529ae7B0e8A8191c0307b918AA62f1Fc6557a621',
    reputation: '0x0DA4162BdFaFd0b5a6Da4151E0415aEaBd87B521',
    validation: '0x5eDa2Be8c2c24039952751C817a7E9C8E018628e',
    fromBlock: 39_944_764n,
  },
}

// ─── events ──
const agentRegisteredEvent = parseAbiItem(
  'event AgentRegistered(uint256 indexed agentId, address indexed owner, address indexed agentAddress, string cardURI)',
)
const validationRequestedEvent = parseAbiItem(
  'event ValidationRequested(uint256 indexed requestId, uint256 indexed agentId, address indexed requester, bytes32 dataHash, string uri)',
)

// ─── read ABIs ──
const identityAbi = [
  parseAbiItem(
    'function resolve(uint256 agentId) view returns (address owner, address agentAddress, string cardURI)',
  ),
  parseAbiItem('function agentIdByAddress(address) view returns (uint256)'),
  parseAbiItem('function totalAgents() view returns (uint256)'),
] as const
const reputationAbi = [
  parseAbiItem('function getReputation(uint256 agentId) view returns (uint256 count, uint256 averageScore)'),
] as const
const validationAbi = [
  parseAbiItem(
    'function getValidation(uint256 requestId) view returns ((uint256 agentId, address requester, bytes32 dataHash, string requestUri, address validator, bool responded, bool passed, uint8 score, string responseUri, uint64 requestedAt, uint64 respondedAt))',
  ),
] as const

// ─── types ──
export interface AgentCard {
  protocolVersion?: string
  name?: string
  description?: string
  url?: string
  version?: string
  agentAddress?: string
  network?: string
  chainId?: number
  capabilities?: Record<string, boolean>
  skills?: { id: string; name: string; description: string }[]
  registrations?: { agentId: string; registry: string; chainId: number }[]
}

export interface AgentInfo {
  agentId: bigint
  owner: Address
  agentAddress: Address
  cardURI: string
  card: AgentCard | null
  registeredBlock: bigint
}

export interface Reputation {
  count: bigint
  averageScore: bigint
}

export interface ValidationInfo {
  requestId: bigint
  agentId: bigint
  requester: Address
  validator: Address
  responded: boolean
  passed: boolean
  score: number
  dataHash: Hex
  requestUri: string
  responseUri: string
}

/** Decode an agent card from a `data:application/json;base64,…` URI (or null). */
export function decodeCard(cardURI: string): AgentCard | null {
  try {
    if (cardURI.startsWith('data:application/json;base64,')) {
      const b64 = cardURI.slice('data:application/json;base64,'.length)
      const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8')
      return JSON.parse(json) as AgentCard
    }
    return null
  } catch {
    return null
  }
}

const CHUNK = 9_000n // Mantle caps eth_getLogs at 10k blocks/call.

type DecodedLog = {
  args: Record<string, unknown>
  blockNumber: bigint | null
  transactionHash: Hex | null
}

async function getLogsChunked(
  client: PublicClient,
  params: {
    address: Address
    event: typeof agentRegisteredEvent | typeof validationRequestedEvent
    args?: Record<string, unknown>
    fromBlock: bigint
  },
): Promise<DecodedLog[]> {
  const latest = await client.getBlockNumber()
  const out: DecodedLog[] = []
  for (let start = params.fromBlock; start <= latest; start += CHUNK + 1n) {
    const end = start + CHUNK > latest ? latest : start + CHUNK
    const logs = await client.getLogs({
      address: params.address,
      event: params.event as never,
      args: params.args as never,
      fromBlock: start,
      toBlock: end,
    })
    out.push(...(logs as unknown as DecodedLog[]))
  }
  return out
}

function reg(chainId: ChainId) {
  return ERC8004_REGISTRIES[chainId]
}

/** Resolve one agent id → owner, operational address, decoded card. */
export async function resolveAgent(
  client: PublicClient,
  chainId: ChainId,
  agentId: bigint,
): Promise<AgentInfo> {
  const r = reg(chainId)
  const [owner, agentAddress, cardURI] = (await client.readContract({
    address: r.identity,
    abi: identityAbi,
    functionName: 'resolve',
    args: [agentId],
  })) as [Address, Address, string]
  return { agentId, owner, agentAddress, cardURI, card: decodeCard(cardURI), registeredBlock: 0n }
}

/** Every agent registered to `owner` (most recent first), with decoded cards. */
export async function getAgentsByOwner(
  client: PublicClient,
  chainId: ChainId,
  owner: Address,
): Promise<AgentInfo[]> {
  const r = reg(chainId)
  const logs = await getLogsChunked(client, {
    address: r.identity,
    event: agentRegisteredEvent,
    args: { owner },
    fromBlock: r.fromBlock,
  })
  const seen = new Map<string, bigint>() // agentId → block
  for (const log of logs) {
    const id = log.args.agentId as bigint | undefined
    if (id !== undefined) seen.set(id.toString(), log.blockNumber ?? 0n)
  }
  const infos = await Promise.all(
    Array.from(seen.entries()).map(async ([id, block]) => {
      const info = await resolveAgent(client, chainId, BigInt(id)).catch(() => null)
      if (!info) return null
      return { ...info, registeredBlock: block }
    }),
  )
  return infos
    .filter((a): a is AgentInfo => a !== null)
    .sort((a, b) => Number(b.agentId - a.agentId))
}

export async function getReputation(
  client: PublicClient,
  chainId: ChainId,
  agentId: bigint,
): Promise<Reputation> {
  const [count, averageScore] = (await client.readContract({
    address: reg(chainId).reputation,
    abi: reputationAbi,
    functionName: 'getReputation',
    args: [agentId],
  })) as [bigint, bigint]
  return { count, averageScore }
}

/** All validation requests targeting `agentId`, newest first, with responses. */
export async function getValidationsForAgent(
  client: PublicClient,
  chainId: ChainId,
  agentId: bigint,
): Promise<ValidationInfo[]> {
  const r = reg(chainId)
  const logs = await getLogsChunked(client, {
    address: r.validation,
    event: validationRequestedEvent,
    args: { agentId },
    fromBlock: r.fromBlock,
  })
  const requestIds = logs
    .map(l => l.args.requestId as bigint | undefined)
    .filter((x): x is bigint => x !== undefined)
  const out = await Promise.all(
    requestIds.map(async requestId => {
      const v = (await client
        .readContract({
          address: r.validation,
          abi: validationAbi,
          functionName: 'getValidation',
          args: [requestId],
        })
        .catch(() => null)) as ValidationInfo | null
      if (!v) return null
      return { ...v, requestId }
    }),
  )
  return out
    .filter((v): v is ValidationInfo => v !== null)
    .sort((a, b) => Number(b.requestId - a.requestId))
}

export async function agentIdByAddress(
  client: PublicClient,
  chainId: ChainId,
  addr: Address,
): Promise<bigint> {
  return (await client.readContract({
    address: reg(chainId).identity,
    abi: identityAbi,
    functionName: 'agentIdByAddress',
    args: [addr],
  })) as bigint
}
