/**
 * Live integration tests against ALL FOUR deployed contracts on Casper Testnet.
 * Each case builds a real contract call (casper-js-sdk), submits it, polls the
 * RPC for the execution result, and asserts success — proving the deployed Wasm
 * logic works on-chain, not just that it installed.
 *
 *   bun run scripts/casper/test-all.ts
 *
 * Env: NEBULA_{IDENTITY,REPUTATION,VALIDATION,AMM}_PACKAGE_HASH,
 *      CASPER_SECRET_KEY_PATH, CSPR_CLOUD_API_KEY.
 */
import { readFileSync } from 'node:fs'
import {
  Args,
  CLValue,
  ContractCallBuilder,
  HttpHandler,
  Key,
  KeyAlgorithm,
  PrivateKey,
  RpcClient,
} from 'casper-js-sdk'

const NODE = process.env.CASPER_NODE_RPC ?? 'https://node.testnet.cspr.cloud/rpc'
const CHAIN = process.env.CASPER_CHAIN_NAME ?? 'casper-test'
const PEM = process.env.CASPER_SECRET_KEY_PATH
if (!PEM) throw new Error('set CASPER_SECRET_KEY_PATH')
const PKG = {
  identity: process.env.NEBULA_IDENTITY_PACKAGE_HASH ?? '',
  reputation: process.env.NEBULA_REPUTATION_PACKAGE_HASH ?? '',
  validation: process.env.NEBULA_VALIDATION_PACKAGE_HASH ?? '',
  amm: process.env.NEBULA_AMM_PACKAGE_HASH ?? '',
}

const handler = new HttpHandler(NODE)
if (process.env.CSPR_CLOUD_API_KEY) handler.setCustomHeaders({ Authorization: process.env.CSPR_CLOUD_API_KEY })
const rpc = new RpcClient(handler)
const sk = PrivateKey.fromPem(readFileSync(PEM, 'utf8'), KeyAlgorithm.SECP256K1)

async function waitResult(hash: string): Promise<{ ok: boolean; error?: string }> {
  const any = rpc as unknown as { getTransactionByTransactionHash?: (h: string) => Promise<unknown> }
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 5000))
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

async function call(pkg: string, entryPoint: string, argsMap: Record<string, CLValue>, payCspr = 6): Promise<boolean> {
  const tx = new ContractCallBuilder()
    .from(sk.publicKey)
    .chainName(CHAIN)
    .byPackageHash(pkg.replace(/^hash-/, ''))
    .entryPoint(entryPoint)
    .runtimeArgs(Args.fromMap(argsMap))
    .payment(payCspr * 1_000_000_000)
    .build()
  tx.sign(sk)
  const submitted = (await rpc.putTransaction(tx)) as { transactionHash?: { toHex?(): string } }
  const hash = submitted.transactionHash?.toHex?.() ?? String(submitted.transactionHash ?? submitted)
  const res = await waitResult(hash)
  const tag = res.ok ? '✅ PASS' : `❌ FAIL (${res.error})`
  console.log(`${tag}  ${entryPoint}  ${hash.slice(0, 12)}…`)
  return res.ok
}

const rndHex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')

const results: boolean[] = []
console.log('— Live contract logic tests (Casper Testnet) —\n')

// 1) IdentityRegistry.register — create an agent identity
results.push(
  await call(PKG.identity, 'register', {
    card_uri: CLValue.newCLString(`ipfs://nebula-agent-${rndHex(8)}`),
    agent_address: CLValue.newCLKey(Key.newKey(`account-hash-${rndHex(64)}`)),
  }),
)

// 2) ReputationRegistry.give_feedback — score an agent
results.push(
  await call(PKG.reputation, 'give_feedback', {
    agent_id: CLValue.newCLUint64(1),
    score: CLValue.newCLUint8(80),
    tag: CLValue.newCLString('quality'),
    _uri: CLValue.newCLString(''),
  }),
)

// 3) ValidationRegistry.request_validation — open a validation request
results.push(
  await call(PKG.validation, 'request_validation', {
    agent_id: CLValue.newCLUint64(1),
    data_hash: CLValue.newCLString(`0x${rndHex(64)}`),
    _uri: CLValue.newCLString(''),
  }),
)

// 4) Amm.add_liquidity — seed the constant-product pool
results.push(
  await call(PKG.amm, 'add_liquidity', {
    amount_a: CLValue.newCLUInt256(1_000_000),
    amount_b: CLValue.newCLUInt256(2_000_000),
  }),
)

// 5) Amm.swap_a_for_b — swap A→B against the pool (min_out 0)
results.push(
  await call(PKG.amm, 'swap_a_for_b', {
    amount_in: CLValue.newCLUInt256(10_000),
    min_out: CLValue.newCLUInt256(0),
  }),
)

// 6) Amm.swap_b_for_a — the reverse swap B→A (full AMM write surface)
results.push(
  await call(PKG.amm, 'swap_b_for_a', {
    amount_in: CLValue.newCLUInt256(10_000),
    min_out: CLValue.newCLUInt256(0),
  }),
)

const pass = results.filter(Boolean).length
console.log(`\n${pass}/${results.length} live contract tests passed.`)
process.exit(pass === results.length ? 0 : 1)
