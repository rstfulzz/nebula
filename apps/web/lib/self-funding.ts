/**
 * Self-funding dashboard reads — live Casper Testnet state behind Nebula's x402
 * earn → redeem → stake loop. Server-only (uses the authed CSPR.cloud RPC and the
 * CSPR.cloud REST API for delegations).
 *
 * The loop, on-chain:
 *   1. Earn   — agents pay Nebula in CSPRPAY (an Odra CEP-18-style token) via x402.
 *   2. Redeem — Nebula redeems CSPRPAY → CSPR at the PayExchange (1:1 reserve).
 *   3. Stake  — Nebula delegates the CSPR to a validator, compounding rewards.
 *
 * Every number below comes from a live read; if a read fails we fall back to the
 * last-known proven value (flagged `live: false`) so the demo never renders empty.
 */
import 'server-only'
import { blake2b } from '@noble/hashes/blake2.js'
import { HttpHandler, PublicKey, PurseIdentifier, RpcClient, URef } from 'casper-js-sdk'

const RPC = process.env.CASPER_NODE_RPC ?? 'https://node.testnet.cspr.cloud/rpc'
const CSPR_CLOUD_REST = 'https://api.testnet.cspr.cloud'
const API_KEY = process.env.CSPR_CLOUD_API_KEY ?? ''

const MOTES = 1_000_000_000

// Deployed contract package hashes (Casper Testnet). Read from env, with the
// known-good hashes as the default so the page works before env is wired.
const PAY_TOKEN_PKG = (
  process.env.NEBULA_PAY_TOKEN_PACKAGE_HASH ??
  'hash-cf8bb7a60813f18fe35dcbef3c1e4442abc040694e098bfb0576b8970b44ac48'
).replace(/^hash-/, '')
const PAY_EXCHANGE_PKG = (
  process.env.NEBULA_PAY_EXCHANGE_PACKAGE_HASH ??
  'hash-aed6623b3d4d3a2a0e3d13037bf060196f65061368cb9e6a82826150cbd4636f'
).replace(/^hash-/, '')

// Nebula's agent identity. The public key signs; the account-hash keys the dicts
// and delegations. Both are derivable from the public key, hardcoded here as the
// canonical demo identity.
export const NEBULA_AGENT_PUBLIC_KEY =
  '0203dc4a23af775ed29fc045565256c35b3519cc9bad1b7e7051172ce2cffc61cc45'
export const NEBULA_AGENT_ACCOUNT_HASH =
  'f9e4929ee4a1937e7de9d743a75c265e6d96158969a08869b5e2ec9b19ae0bda'
export const NEBULA_VALIDATOR =
  '0106ca7c39cd272dbf21a86eeb3b36b7c26e2e9b94af64292419f7862936bca2ca'

// ─── helpers ──────────────────────────────────────────────────────────────

function rpc(): RpcClient {
  const handler = new HttpHandler(RPC)
  if (API_KEY) handler.setCustomHeaders({ Authorization: API_KEY })
  return new RpcClient(handler)
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

/** Odra `Mapping<Address, U256>` (field index 1 = balances) item key for an account. */
function payTokenBalanceDictKey(accountHashHex: string): string {
  const fieldIndex = new Uint8Array([0, 0, 0, 1]) // u32 big-endian = 1 (balances)
  const keyTag = new Uint8Array([0x00]) // Key::Account tag
  const accountHash = hexToBytes(accountHashHex)
  const pre = new Uint8Array(fieldIndex.length + keyTag.length + accountHash.length)
  pre.set(fieldIndex, 0)
  pre.set(keyTag, fieldIndex.length)
  pre.set(accountHash, fieldIndex.length + keyTag.length)
  return bytesToHex(blake2b(pre, { dkLen: 32 }))
}

/** Odra simple `Var` (field index) item key. */
function odraVarDictKey(fieldIndex: number): string {
  const fi = new Uint8Array([0, 0, 0, fieldIndex & 0xff]) // u32 big-endian
  return bytesToHex(blake2b(fi, { dkLen: 32 }))
}

/**
 * Decode an Odra `List<U8>` bytesrepr that wraps a `U256`:
 *   4-byte LE length prefix + (1-byte U256 length + LE value bytes).
 * Returns the value as a bigint (motes).
 */
function decodeListU8U256(hex: string): bigint {
  const b = hexToBytes(hex)
  const len = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)
  const inner = b.slice(4, 4 + len)
  const u256len = inner[0] ?? 0
  let v = 0n
  for (let i = 0; i < u256len; i++) v += BigInt(inner[1 + i] ?? 0) << (8n * BigInt(i))
  return v
}

type GlobalStateJson = {
  rawJSON?: {
    stored_value?: {
      ContractPackage?: { versions?: { contract_hash?: string }[] }
      Contract?: { named_keys?: { name: string; key: string }[] }
    }
  }
}

/** Resolve a package hash → its active contract's named keys (name → key). */
async function contractNamedKeys(
  client: RpcClient,
  pkgHashHex: string,
): Promise<Record<string, string>> {
  const pkgQ = (await client.queryLatestGlobalState(`hash-${pkgHashHex}`, [])) as GlobalStateJson
  const versions = pkgQ.rawJSON?.stored_value?.ContractPackage?.versions ?? []
  const contractHash = versions[versions.length - 1]?.contract_hash
  if (!contractHash) throw new Error('no active contract version')
  const hashKey = `hash-${contractHash.replace(/^contract-/, '')}`
  const cQ = (await client.queryLatestGlobalState(hashKey, [])) as GlobalStateJson
  const named = cQ.rawJSON?.stored_value?.Contract?.named_keys ?? []
  return Object.fromEntries(named.map((k) => [k.name, k.key]))
}

type DictJson = {
  rawJSON?: { stored_value?: { CLValue?: { bytes?: string } } }
}

// ─── public reads ───────────────────────────────────────────────────────────

export type Live<T> = T & { live: boolean }

export interface RevenueRead {
  /** Nebula's CSPRPAY balance (its x402 earnings), in whole tokens. */
  csprpay: number
  live: boolean
}

/** Card 1 — Nebula's CSPRPAY balance from the PayToken `state` balances dict. */
export async function readRevenue(): Promise<RevenueRead> {
  const FALLBACK = 999_499.5
  try {
    const client = rpc()
    const named = await contractNamedKeys(client, PAY_TOKEN_PKG)
    const stateUref = named.state
    if (!stateUref) throw new Error('no state uref')
    const key = payTokenBalanceDictKey(NEBULA_AGENT_ACCOUNT_HASH)
    const d = (await client.getDictionaryItem(null, stateUref, key)) as DictJson
    const bytes = d.rawJSON?.stored_value?.CLValue?.bytes
    if (!bytes) throw new Error('no clvalue bytes')
    const motes = decodeListU8U256(bytes)
    return { csprpay: Number(motes) / MOTES, live: true }
  } catch {
    return { csprpay: FALLBACK, live: false }
  }
}

export interface ExchangeRead {
  /** CSPR held in the PayExchange reserve purse. */
  reserveCspr: number
  /** Total CSPR redeemed out of the exchange so far. */
  redeemedTotalCspr: number
  live: boolean
}

/** Card 2 — PayExchange CSPR reserve (main purse) + redeemed total (state field 4). */
export async function readExchange(): Promise<ExchangeRead> {
  const FALLBACK: ExchangeRead = { reserveCspr: 20, redeemedTotalCspr: 500, live: false }
  try {
    const client = rpc()
    const named = await contractNamedKeys(client, PAY_EXCHANGE_PKG)
    const purseUref = named.__contract_main_purse
    const stateUref = named.state
    if (!purseUref || !stateUref) throw new Error('missing exchange named keys')

    const bal = (await client.queryLatestBalance(
      PurseIdentifier.fromUref(URef.fromString(purseUref)),
    )) as { balance?: { toString(): string } }
    const reserveMotes = BigInt((bal.balance ?? 0).toString())

    // redeemed_total is the Odra Var at field index 4.
    const d = (await client.getDictionaryItem(null, stateUref, odraVarDictKey(4))) as DictJson
    const redeemedMotes = d.rawJSON?.stored_value?.CLValue?.bytes
      ? decodeListU8U256(d.rawJSON.stored_value.CLValue.bytes)
      : 0n

    return {
      reserveCspr: Number(reserveMotes) / MOTES,
      redeemedTotalCspr: Number(redeemedMotes) / MOTES,
      live: true,
    }
  } catch {
    return FALLBACK
  }
}

export interface StakeRead {
  /** CSPR the agent has delegated (compounding). */
  delegatedCspr: number
  /** The agent's liquid (un-delegated) CSPR. */
  liquidCspr: number
  validator: string
  live: boolean
}

/** Card 3 — delegated stake (CSPR.cloud REST) + liquid balance (RPC). */
export async function readStake(): Promise<StakeRead> {
  const FALLBACK: StakeRead = {
    delegatedCspr: 500,
    liquidCspr: 4458.3,
    validator: NEBULA_VALIDATOR,
    live: false,
  }
  try {
    const client = rpc()
    const pub = PublicKey.fromHex(NEBULA_AGENT_PUBLIC_KEY)

    const balRes = (await client.queryLatestBalance(PurseIdentifier.fromPublicKey(pub))) as {
      balance?: { toString(): string }
    }
    const liquidMotes = BigInt((balRes.balance ?? 0).toString())

    // delegations via CSPR.cloud REST (auction bids no longer carry delegators in 2.0).
    const res = await fetch(
      `${CSPR_CLOUD_REST}/accounts/${NEBULA_AGENT_PUBLIC_KEY}/delegations`,
      { headers: API_KEY ? { authorization: API_KEY } : {}, cache: 'no-store' },
    )
    let delegatedMotes = 0n
    let validator = NEBULA_VALIDATOR
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { stake?: string; validator_public_key?: string }[]
      }
      const onValidator =
        json.data?.find(
          (d) => (d.validator_public_key ?? '').toLowerCase() === NEBULA_VALIDATOR.toLowerCase(),
        ) ?? json.data?.[0]
      if (onValidator?.stake) delegatedMotes = BigInt(onValidator.stake)
      if (onValidator?.validator_public_key) validator = onValidator.validator_public_key
    }

    return {
      delegatedCspr: Number(delegatedMotes) / MOTES,
      liquidCspr: Number(liquidMotes) / MOTES,
      validator,
      live: true,
    }
  } catch {
    return FALLBACK
  }
}

export interface ActivityItem {
  hash: string
  label: string
  kind: 'earn' | 'redeem' | 'stake' | 'seed'
  detail: string
}

/**
 * Card 4 — the proven on-chain loop, newest first. These are the curated,
 * verified transactions that demonstrate the full earn → redeem → stake cycle.
 */
export const ACTIVITY: ActivityItem[] = [
  {
    hash: '03c85b9b893f0f1b2a6398bc3fbb06a55ef1cbf54598b08737fe4647f50fdc5d',
    label: 'Stake 500 CSPR',
    kind: 'stake',
    detail: 'Delegated the redeemed CSPR to a validator — compounding.',
  },
  {
    hash: '30c0cf7b952e1e21c2f41c6c586fc01d03f29c87421430da65f4e9169a6718a6',
    label: 'Redeem CSPRPAY → CSPR',
    kind: 'redeem',
    detail: 'Converted earned CSPRPAY to native CSPR at the PayExchange.',
  },
  {
    hash: '07747714d43e65a98aafe9a30544a8c795eb185179d7242847a683d5b6c05736',
    label: 'Earn via x402 settle',
    kind: 'earn',
    detail: 'An agent paid Nebula in CSPRPAY for a tool call (x402).',
  },
  {
    hash: '2fef24921bd6e2b9c973514998429ad4e095ac3a9c3f58ab3759968db76cff01',
    label: 'Seed the exchange reserve',
    kind: 'seed',
    detail: 'Bootstrapped the PayExchange CSPR reserve.',
  },
]

export interface SelfFundingSnapshot {
  revenue: RevenueRead
  exchange: ExchangeRead
  stake: StakeRead
  activity: ActivityItem[]
}

/** Read all four cards in parallel. */
export async function readSelfFunding(): Promise<SelfFundingSnapshot> {
  const [revenue, exchange, stake] = await Promise.all([
    readRevenue(),
    readExchange(),
    readStake(),
  ])
  return { revenue, exchange, stake, activity: ACTIVITY }
}
