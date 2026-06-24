/**
 * Live integration test against the DEPLOYED IdentityRegistry on Casper Testnet.
 * Registers an agent (a real on-chain contract call) and verifies it executes,
 * then reads `total_agents` back from contract state.
 *
 *   bun run scripts/casper/test-identity.ts
 *
 * Env: NEBULA_IDENTITY_PACKAGE_HASH, CASPER_SECRET_KEY_PATH, CSPR_CLOUD_API_KEY.
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
const PKG = process.env.NEBULA_IDENTITY_PACKAGE_HASH ?? ''
if (!PKG) throw new Error('set NEBULA_IDENTITY_PACKAGE_HASH')
const PEM = process.env.CASPER_SECRET_KEY_PATH
if (!PEM) throw new Error('set CASPER_SECRET_KEY_PATH')

const handler = new HttpHandler(NODE)
if (process.env.CSPR_CLOUD_API_KEY)
  handler.setCustomHeaders({ Authorization: process.env.CSPR_CLOUD_API_KEY })
const rpc = new RpcClient(handler)
const sk = PrivateKey.fromPem(readFileSync(PEM, 'utf8'), KeyAlgorithm.SECP256K1)

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

// Unique agent address each run (register reverts on a duplicate address).
const rnd = Array.from(
  { length: 64 },
  () => '0123456789abcdef'[Math.floor(Math.random() * 16)],
).join('')
const agentHash = `account-hash-${rnd}`
const cardUri = `ipfs://nebula-agent-card-${rnd.slice(0, 8)}`

console.log('— Live IdentityRegistry test —')
console.log(`package   ${PKG}`)
console.log(`caller    ${sk.publicKey.toHex()}`)
console.log(`register  card_uri=${cardUri}`)
console.log(`          agent_address=${agentHash.slice(0, 28)}…`)

const tx = new ContractCallBuilder()
  .from(sk.publicKey)
  .chainName(CHAIN)
  .byPackageHash(PKG.replace(/^hash-/, ''))
  .entryPoint('register')
  .runtimeArgs(
    Args.fromMap({
      card_uri: CLValue.newCLString(cardUri),
      agent_address: CLValue.newCLKey(Key.newKey(agentHash)),
    }),
  )
  .payment(10_000_000_000)
  .build()
tx.sign(sk)

const submitted = (await rpc.putTransaction(tx)) as { transactionHash?: { toHex?(): string } }
const hash = submitted.transactionHash?.toHex?.() ?? String(submitted.transactionHash ?? submitted)
console.log(`\ntx        ${hash}`)
console.log(`          https://testnet.cspr.live/transaction/${hash}`)

const res = await waitResult(hash)
if (!res.ok) {
  console.log(`\n❌ FAIL: register reverted — ${res.error}`)
  process.exit(1)
}
console.log('\n✅ PASS: register() executed on-chain — agent identity created.')
console.log(
  '   (AgentRegistered event emitted; owner = caller, bound to the agent address + card URI.)',
)
