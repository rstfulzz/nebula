/**
 * Seed the PayExchange with native CSPR liquidity via the generic cargo-purse
 * session (`contracts-session/payable_call_session.wasm`).
 *
 * The session creates a purse, funds it from the signer's main purse, and calls
 * the latest PayExchange version's payable `seed()` with `cargo_purse`. The
 * attached motes land in the exchange's CSPR reserve, backing CSPRPAY -> CSPR
 * redemptions (the self-funding compound loop).
 *
 * Usage: bun scripts/casper/pay-seed.ts <amountCspr>   (default 520)
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
const EXCHANGE = (process.env.NEBULA_PAY_EXCHANGE_PACKAGE_HASH ?? '').replace(/^hash-/, '')
const WASM = `${import.meta.dir}/../../contracts-session/payable_call_session.wasm`

async function main() {
  if (!EXCHANGE) throw new Error('set NEBULA_PAY_EXCHANGE_PACKAGE_HASH')
  const amountCspr = Number(process.argv[2] ?? 520)
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
  const exchangeBytes = Uint8Array.from(Buffer.from(EXCHANGE, 'hex')) // 32-byte package hash
  const tx = new SessionBuilder()
    .from(signer.publicKey)
    .chainName(CHAIN)
    .wasm(wasm)
    .runtimeArgs(
      Args.fromMap({
        amount: CLValue.newCLUInt512(motes.toString()),
        contract: CLValue.newCLByteArray(exchangeBytes),
        entry_point: CLValue.newCLString('seed'),
      }),
    )
    .payment(15_000_000_000) // create purse + native transfer + contract call
    .build()
  tx.sign(signer)

  const submitted = await rpc.putTransaction(tx)
  const hash = submitted.transactionHash.toHex()
  console.log(`seed ${amountCspr} CSPR -> tx ${hash}`)
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const r = await rpc.getTransactionByTransactionHash(hash)
      const e = r?.executionInfo?.executionResult
      if (e) {
        console.log(e.errorMessage ? `reverted: ${e.errorMessage}` : `OK seeded ${amountCspr} CSPR`)
        break
      }
    } catch {}
  }
}

main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
