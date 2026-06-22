/**
 * Native CSPR transfer proof — to a REAL (fresh) recipient, with execution-status
 * verification. (Self-transfers fail with "Invalid purse" — source == target purse.)
 *
 * Run:  bun run scripts/casper/transfer.ts [amountCspr]
 */
import { PrivateKey, KeyAlgorithm } from 'casper-js-sdk'
import { makeRpc, loadSigner, getBalanceMotes } from '../../packages/plugin-onchain/src/client'
import { transferCspr } from '../../packages/plugin-onchain/src/transfer'
import { motesToCspr } from '../../packages/plugin-onchain/src/config'

const amount = Number(process.argv[2] ?? '2.5')
const rpc = makeRpc()
const signer = loadSigner()

// Fresh recipient (a transfer to a new account also creates+funds it).
const recipient = await PrivateKey.generate(KeyAlgorithm.ED25519)
const recipientHex = recipient.publicKey.toHex()
console.log('sender   :', signer.publicKey.toHex())
console.log('recipient:', recipientHex, '(fresh)')

const before = await getBalanceMotes(rpc, signer.publicKey)
console.log('sender before:', motesToCspr(before), 'CSPR')

const { hash, explorer } = await transferCspr(rpc, signer, { to: recipientHex, amountCspr: amount })
console.log('submitted, tx:', hash)
console.log('explorer:', explorer)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let executed = false
let success = false
let errMsg: string | undefined
let printedShape = false

for (let i = 0; i < 24 && !executed; i++) {
  await sleep(5000)
  // Definitive proof: did the recipient receive the funds?
  let recvMotes = 0n
  try {
    recvMotes = await getBalanceMotes(rpc, recipient.publicKey)
  } catch {}
  // Best-effort: read the on-chain execution result for an explicit status.
  try {
    const anyRpc = rpc as any
    if (typeof anyRpc.getTransactionByTransactionHash === 'function') {
      const res = await anyRpc.getTransactionByTransactionHash(hash)
      const info = res?.executionInfo ?? res?.execution_info
      const exec = info?.executionResult ?? info?.execution_result
      if (!printedShape && exec) {
        printedShape = true
        console.log('exec result keys:', Object.keys(exec))
      }
      if (exec) {
        executed = true
        errMsg = exec?.errorMessage ?? exec?.error_message
        success = !errMsg
      }
    }
  } catch {}
  if (recvMotes > 0n) {
    executed = true
    success = true
    console.log('recipient balance:', motesToCspr(recvMotes), 'CSPR ← funds received')
    break
  }
  process.stdout.write(`  waiting… ${(i + 1) * 5}s\n`)
}

const after = await getBalanceMotes(rpc, signer.publicKey)
console.log('sender after :', motesToCspr(after), 'CSPR (delta', motesToCspr(before - after), ')')
if (success) {
  console.log('TRANSFER SUCCEEDED ON-CHAIN ✅')
} else {
  console.log('TRANSFER FAILED ❌', errMsg ? `- ${errMsg}` : '(no recipient funds; check explorer)')
  process.exit(1)
}
