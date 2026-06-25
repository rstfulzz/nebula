/**
 * Fund a Treasury budget via the cargo-purse deposit session.
 *
 * Casper contracts can only receive CSPR through the cargo-purse pattern, and
 * casper-js-sdk can't attach value to a plain contract call. So we deploy
 * `contracts-session/deposit_session.wasm` (create purse → fund it → call the
 * Treasury's payable `deposit()` with `cargo_purse`) as a normal session deploy.
 * This works against CSPR.cloud directly — no Odra livenet / SSE node needed.
 *
 * The caller (signer) becomes the owner credited with the budget.
 *
 * Usage: bun scripts/casper/treasury-deposit.ts <amountCspr>   (default 50)
 */
import { readFileSync } from 'node:fs'
import {
  Args,
  CLValue,
  HttpHandler,
  KeyAlgorithm,
  PrivateKey,
  RpcClient,
  SessionBuilder,
} from 'casper-js-sdk'

const RPC = process.env.CASPER_NODE_RPC ?? 'https://node.testnet.cspr.cloud/rpc'
const CHAIN = process.env.CASPER_CHAIN_NAME ?? 'casper-test'
const TREASURY = (process.env.NEBULA_TREASURY_PACKAGE_HASH ?? '').replace(/^hash-/, '')
const WASM = `${import.meta.dir}/../../contracts-session/deposit_session.wasm`

async function main() {
  if (!TREASURY) throw new Error('set NEBULA_TREASURY_PACKAGE_HASH')
  const amountCspr = Number(process.argv[2] ?? 50)
  const motes = BigInt(Math.round(amountCspr * 1e9))

  const h = new HttpHandler(RPC)
  if (process.env.CSPR_CLOUD_API_KEY)
    h.setCustomHeaders({ Authorization: process.env.CSPR_CLOUD_API_KEY })
  const rpc = new RpcClient(h)
  const signer = PrivateKey.fromPem(
    readFileSync(process.env.CASPER_SECRET_KEY_PATH as string, 'utf8'),
    KeyAlgorithm.SECP256K1,
  )

  const wasm = new Uint8Array(readFileSync(WASM))
  const treasuryBytes = Uint8Array.from(Buffer.from(TREASURY, 'hex')) // 32-byte package hash
  const tx = new SessionBuilder()
    .from(signer.publicKey)
    .chainName(CHAIN)
    .wasm(wasm)
    .runtimeArgs(
      Args.fromMap({
        amount: CLValue.newCLUInt512(motes.toString()),
        treasury: CLValue.newCLByteArray(treasuryBytes),
      }),
    )
    .payment(15_000_000_000) // session creates a purse + native transfer + contract call
    .build()
  tx.sign(signer)

  const submitted = await rpc.putTransaction(tx)
  const hash = submitted.transactionHash.toHex()
  console.log(`deposit ${amountCspr} CSPR → ${hash}`)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const r = await rpc.getTransactionByTransactionHash(hash)
      const e = r?.executionInfo?.executionResult
      if (e) {
        console.log(
          e.errorMessage ? `reverted: ${e.errorMessage}` : `✅ deposited ${amountCspr} CSPR`,
        )
        break
      }
    } catch {}
  }
}

main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
