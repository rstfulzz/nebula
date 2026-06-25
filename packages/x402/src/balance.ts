/**
 * Read CSPRPAY (`balance_of`) directly from the PayToken contract's Odra `state`
 * dictionary. CSPR.cloud does not index this custom CEP-3009 token, so we derive
 * the dictionary item key the way Odra (2.8.1) does and query global state.
 *
 * Odra `Mapping<Address, U256>` storage (verified on-chain against the deployer's
 * known balance):
 *   - dictionary seed URef  = the contract's `state` named key.
 *   - dictionary_item_key   = hex( blake2b256( index_bytes ++ key_bytes ) )
 *       index_bytes = u32 big-endian field index. `balances` is field index 1.
 *       key_bytes   = Address::to_bytes = 0x00 (Account tag) ++ account_hash[32].
 *   - stored CLValue is a `List<U8>` whose bytes are `len(u32-LE) ++ U256-bytesrepr`.
 *       U256-bytesrepr = 1-byte significant-length ++ little-endian magnitude.
 */
import { blake2b } from '@noble/hashes/blake2.js'
import { PublicKey } from 'casper-js-sdk'
import { CASPER_NODE_RPC, CSPR_CLOUD_API_KEY, PAY_TOKEN_PACKAGE_HASH } from './config'

/** Field index of `balances` inside the PayToken Odra module. */
const BALANCES_FIELD_INDEX = 1

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(CASPER_NODE_RPC, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(CSPR_CLOUD_API_KEY ? { authorization: CSPR_CLOUD_API_KEY } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = (await res.json()) as { result?: T; error?: { message: string; data?: string } }
  if (json.error) {
    throw new Error(
      `${method} failed: ${json.error.message}${json.error.data ? ` (${json.error.data})` : ''}`,
    )
  }
  return json.result as T
}

/** Resolve the latest contract hash for the PayToken package. */
async function latestContractHash(): Promise<string> {
  const srh = (await rpc<{ state_root_hash: string }>('chain_get_state_root_hash', {}))
    .state_root_hash
  const pkg = await rpc<{
    stored_value: { ContractPackage: { versions: Array<{ contract_hash: string }> } }
  }>('query_global_state', {
    state_identifier: { StateRootHash: srh },
    key: `hash-${PAY_TOKEN_PACKAGE_HASH}`,
    path: [],
  })
  const versions = pkg.stored_value.ContractPackage.versions
  const last = versions[versions.length - 1]
  if (!last) throw new Error('PayToken package has no contract versions')
  return last.contract_hash.replace(/^contract-/, '')
}

/** Resolve the `state` dictionary seed URef from the contract's named keys. */
async function stateUref(contractHash: string): Promise<string> {
  const srh = (await rpc<{ state_root_hash: string }>('chain_get_state_root_hash', {}))
    .state_root_hash
  const contract = await rpc<{
    stored_value: { Contract: { named_keys: Array<{ name: string; key: string }> } }
  }>('query_global_state', {
    state_identifier: { StateRootHash: srh },
    key: `hash-${contractHash}`,
    path: [],
  })
  const nk = contract.stored_value.Contract.named_keys.find(k => k.name === 'state')
  if (!nk) throw new Error('PayToken contract has no `state` named key')
  return nk.key
}

/** Compute the Odra dictionary_item_key for `balances[address]`. */
function balanceDictKey(accountHashHex: string): string {
  const indexBytes = new Uint8Array([0, 0, 0, BALANCES_FIELD_INDEX]) // u32 big-endian
  const addrBytes = new Uint8Array([0x00, ...Buffer.from(accountHashHex, 'hex')]) // Address::Account
  return hex(blake2b(new Uint8Array([...indexBytes, ...addrBytes]), { dkLen: 32 }))
}

/** Decode the `List<U8>` CLValue bytes into a U256 (atomic CSPRPAY) bigint. */
function decodeBalance(clBytesHex: string): bigint {
  const bytes = Buffer.from(clBytesHex, 'hex')
  // Outer Vec<u8>: 4-byte LE length prefix, then the inner U256 bytesrepr.
  const inner = bytes.subarray(4)
  if (inner.length === 0) return 0n
  const sigLen = inner[0] ?? 0
  let v = 0n
  for (let i = sigLen; i >= 1; i--) v = (v << 8n) | BigInt(inner[i] ?? 0)
  return v
}

let cachedContractHash: string | undefined
let cachedStateUref: string | undefined

/**
 * Read an account's CSPRPAY balance (atomic units, 9 decimals). Accepts a Casper
 * public-key hex or a raw 64-char account hash.
 */
export async function payTokenBalanceOf(publicKeyOrAccountHash: string): Promise<bigint> {
  const accountHashHex = /^0[12]/.test(publicKeyOrAccountHash)
    ? PublicKey.fromHex(publicKeyOrAccountHash).accountHash().toHex()
    : publicKeyOrAccountHash.replace(/^account-hash-/, '')

  if (!cachedContractHash) cachedContractHash = await latestContractHash()
  if (!cachedStateUref) cachedStateUref = await stateUref(cachedContractHash)

  const srh = (await rpc<{ state_root_hash: string }>('chain_get_state_root_hash', {}))
    .state_root_hash
  try {
    const item = await rpc<{ stored_value: { CLValue: { bytes: string } } }>(
      'state_get_dictionary_item',
      {
        state_root_hash: srh,
        dictionary_identifier: {
          URef: { seed_uref: cachedStateUref, dictionary_item_key: balanceDictKey(accountHashHex) },
        },
      },
    )
    return decodeBalance(item.stored_value.CLValue.bytes)
  } catch (err) {
    // A never-funded account has no dictionary entry -> balance 0.
    if (err instanceof Error && /value was not found/i.test(err.message)) return 0n
    throw err
  }
}
