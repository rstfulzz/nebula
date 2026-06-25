/**
 * Deploy the Odra contracts to Casper Testnet via casper-js-sdk against the
 * CSPR.cloud node (auth header), polling the RPC for the execution result —
 * no SSE events needed. Replicates Odra's install args (3 odra_cfg_* named args;
 * init() takes none).
 *
 *   bun run scripts/casper/deploy.ts [ContractName ...]
 */
import { readFileSync } from 'node:fs'
import {
  Args,
  CLValue,
  HttpHandler,
  Key,
  KeyAlgorithm,
  PrivateKey,
  RpcClient,
  SessionBuilder,
} from 'casper-js-sdk'

// Some contracts take init() args beyond Odra's odra_cfg_*; declared per-entry below.
type InitArgs = Record<string, CLValue>
const PAY_TOKEN_HASH =
  process.env.NEBULA_PAY_TOKEN_PACKAGE_HASH ??
  'hash-cf8bb7a60813f18fe35dcbef3c1e4442abc040694e098bfb0576b8970b44ac48'

const NODE = process.env.CASPER_NODE_RPC ?? 'https://node.testnet.cspr.cloud/rpc'
const CHAIN = process.env.CASPER_CHAIN_NAME ?? 'casper-test'
const KEY = process.env.CSPR_CLOUD_API_KEY
const PEM = process.env.CASPER_SECRET_KEY_PATH
if (!PEM) throw new Error('set CASPER_SECRET_KEY_PATH')

const handler = new HttpHandler(NODE)
if (KEY) handler.setCustomHeaders({ Authorization: KEY })
const rpc = new RpcClient(handler)
const sk = PrivateKey.fromPem(readFileSync(PEM, 'utf8'), KeyAlgorithm.SECP256K1)

const ALL = [
  { name: 'IdentityRegistry', key: 'nebula_identity_registry', pay: 500 },
  { name: 'ReputationRegistry', key: 'nebula_reputation_registry', pay: 500 },
  { name: 'ValidationRegistry', key: 'nebula_validation_registry', pay: 500 },
  { name: 'Amm', key: 'nebula_amm', pay: 550 },
  { name: 'Token', key: 'nebula_token', pay: 550 },
  { name: 'Treasury', key: 'nebula_treasury', pay: 400 },
  { name: 'PayToken', key: 'nebula_pay_token', pay: 450 },
  {
    name: 'PayExchange',
    key: 'nebula_pay_exchange',
    pay: 450,
    init: { pay_token: CLValue.newCLKey(Key.newKey(PAY_TOKEN_HASH)) } as InitArgs,
  },
]
const want = process.argv.slice(2)
const contracts = want.length ? ALL.filter(c => want.includes(c.name)) : ALL

const MOTES = 1_000_000_000

async function waitResult(hash: string): Promise<{ ok: boolean; error?: string }> {
  const any = rpc as unknown as {
    getTransactionByTransactionHash?: (h: string) => Promise<unknown>
  }
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const r = (await any.getTransactionByTransactionHash?.(hash)) as {
        executionInfo?: { executionResult?: { errorMessage?: string } }
      }
      const exec = r?.executionInfo?.executionResult
      if (exec) return { ok: !exec.errorMessage, error: exec.errorMessage }
    } catch {
      /* keep polling */
    }
  }
  return { ok: false, error: 'no execution result within timeout' }
}

for (const c of contracts) {
  // Lower to the MVP Wasm feature set (Casper's VM rejects bulk-memory/sign-ext);
  // idempotent if the wasm is already MVP. Falls back to the raw wasm if wasm-opt
  // is unavailable.
  const src = `contracts/wasm/${c.name}.wasm`
  const lowered = `/tmp/nebula-${c.name}-mvp.wasm`
  const opt = Bun.spawnSync([
    'wasm-opt',
    src,
    '--enable-bulk-memory',
    '--enable-sign-ext',
    '--signext-lowering',
    '--llvm-memory-copy-fill-lowering',
    '--memory-packing',
    '-O2',
    '-o',
    lowered,
  ])
  const wasm = new Uint8Array(readFileSync(opt.exitCode === 0 ? lowered : src))
  const args = Args.fromMap({
    odra_cfg_package_hash_key_name: CLValue.newCLString(c.key),
    odra_cfg_allow_key_override: CLValue.newCLValueBool(true),
    odra_cfg_is_upgradable: CLValue.newCLValueBool(true),
    odra_cfg_is_upgrade: CLValue.newCLValueBool(false),
    ...((c as { init?: InitArgs }).init ?? {}),
  })
  const tx = new SessionBuilder()
    .from(sk.publicKey)
    .chainName(CHAIN)
    .wasm(wasm)
    .installOrUpgrade()
    .runtimeArgs(args)
    .payment(c.pay * MOTES)
    .build()
  tx.sign(sk)

  const submitted = (await rpc.putTransaction(tx)) as { transactionHash?: { toHex?(): string } }
  const hash =
    submitted.transactionHash?.toHex?.() ?? String(submitted.transactionHash ?? submitted)
  console.log(`\n${c.name}: submitted ${hash}`)
  console.log(`  https://testnet.cspr.live/transaction/${hash}`)
  const res = await waitResult(hash)
  if (!res.ok) {
    console.log(`  ❌ FAILED: ${res.error}`)
    process.exit(1)
  }
  console.log(`  ✅ installed → named key '${c.key}' (read its package hash from the account)`)
}
console.log('\nDone. Record the package hashes in knowledge/reference/contracts.md.')
