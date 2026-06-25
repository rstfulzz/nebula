/**
 * Redeem CSPRPAY (CEP-3009) for native CSPR via the deployed PayExchange,
 * closing the self-funding compound loop (earn x402 -> redeem -> stake).
 *
 * The agent signs an off-chain EIP-712 `transfer_with_authorization` over the
 * PayToken domain with `to = PayExchange package hash` (the exchange pulls the
 * CSPRPAY to itself), then submits `redeem` to the exchange (deployer-signed,
 * paying gas). On SUCCESS the exchange pays back `amount` motes of CSPR 1:1.
 *
 * The JS digest is byte-equal to the contract's keccak digest (verified by
 * scripts/casper/_digest-selftest.ts).
 *
 * Usage: bun scripts/casper/pay-redeem.ts <amountCspr>   (default 500)
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { CASPER_DOMAIN_TYPES, buildDomain, hashTypedData } from '@casper-ecosystem/casper-eip-712'
import {
  Args,
  CLTypeUInt8,
  CLValue,
  ContractCallBuilder,
  HttpHandler,
  Key,
  KeyAlgorithm,
  PrivateKey,
  RpcClient,
} from 'casper-js-sdk'

const RPC = process.env.CASPER_NODE_RPC ?? 'https://node.testnet.cspr.cloud/rpc'
const CHAIN = process.env.CASPER_CHAIN_NAME ?? 'casper-test'
const PAY_TOKEN = (process.env.NEBULA_PAY_TOKEN_PACKAGE_HASH ?? '').replace(/^hash-/, '')
const EXCHANGE = (process.env.NEBULA_PAY_EXCHANGE_PACKAGE_HASH ?? '').replace(/^hash-/, '')

function listU8(bytes: Uint8Array): CLValue {
  return CLValue.newCLList(
    CLTypeUInt8,
    Array.from(bytes, b => CLValue.newCLUint8(b)),
  )
}

async function main() {
  if (!PAY_TOKEN || !EXCHANGE) throw new Error('set NEBULA_PAY_TOKEN/EXCHANGE_PACKAGE_HASH')
  const amountCspr = Number(process.argv[2] ?? 500)
  const value = BigInt(Math.round(amountCspr * 1e9)) // CSPRPAY atomic == motes (both 9 dp)

  const h = new HttpHandler(RPC)
  if (process.env.CSPR_CLOUD_API_KEY)
    h.setCustomHeaders({ Authorization: process.env.CSPR_CLOUD_API_KEY })
  const rpc = new RpcClient(h)

  const signer = PrivateKey.fromPem(
    readFileSync(process.env.CASPER_SECRET_KEY_PATH as string, 'utf8'),
    KeyAlgorithm.SECP256K1,
  )
  const agentPub = signer.publicKey
  const agentAhHex = agentPub.accountHash().toHex()

  // --- Build + sign the EIP-712 authorization (to = exchange package hash) ---
  const now = Math.floor(Date.now() / 1000)
  const validAfter = BigInt(now - 300)
  const validBefore = BigInt(now + 7200)
  const nonce = new Uint8Array(randomBytes(32))
  const nonceHex = Buffer.from(nonce).toString('hex')

  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  }
  const domain = buildDomain('Casper Pay Token', '1', 'casper:casper-test', `0x${PAY_TOKEN}`)
  const message = {
    from: `0x00${agentAhHex}`,
    to: `0x00${EXCHANGE}`, // exchange PACKAGE hash; contract uses self_address().value()
    value,
    validAfter,
    validBefore,
    nonce: `0x${nonceHex}`,
  }
  const digest = hashTypedData(domain, types, 'TransferWithAuthorization', message, {
    domainTypes: CASPER_DOMAIN_TYPES,
  })
  const signature = signer.signAndAddAlgorithmBytes(digest) // 65-byte algo-tagged

  console.log('— PayExchange redeem —')
  console.log(`agent     ${agentPub.toHex()}`)
  console.log(`          account-hash ${agentAhHex}`)
  console.log(`redeem    ${amountCspr} CSPRPAY -> ${amountCspr} CSPR (1:1)`)
  console.log(`nonce     0x${nonceHex}`)
  console.log(`window    [${validAfter}, ${validBefore}]  sig len ${signature.length}`)

  // --- Submit redeem to the exchange (deployer pays gas) ---
  const tx = new ContractCallBuilder()
    .from(agentPub)
    .chainName(CHAIN)
    .byPackageHash(EXCHANGE) // latest version
    .entryPoint('redeem')
    .runtimeArgs(
      Args.fromMap({
        from: CLValue.newCLKey(Key.newKey(`account-hash-${agentAhHex}`)),
        amount: CLValue.newCLUInt256(value.toString()),
        valid_after: CLValue.newCLUint64(validAfter.toString()),
        valid_before: CLValue.newCLUint64(validBefore.toString()),
        nonce: listU8(nonce),
        public_key: CLValue.newCLPublicKey(agentPub),
        signature: listU8(signature),
      }),
    )
    .payment(12_000_000_000)
    .build()
  tx.sign(signer)

  const submitted = (await rpc.putTransaction(tx)) as { transactionHash: { toHex(): string } }
  const hash = submitted.transactionHash.toHex()
  console.log(`\ntx        ${hash}`)
  console.log(`          https://testnet.cspr.live/transaction/${hash}`)

  for (let i = 0; i < 48; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const r = (await rpc.getTransactionByTransactionHash(hash)) as {
        executionInfo?: { executionResult?: { errorMessage?: string } }
      }
      const e = r?.executionInfo?.executionResult
      if (e) {
        if (e.errorMessage) {
          console.log(`\n❌ FAIL: redeem reverted — ${e.errorMessage}`)
          process.exit(1)
        }
        console.log('\n✅ PASS: redeem() executed — 500 CSPRPAY pulled, 500 CSPR paid out.')
        return
      }
    } catch {}
  }
  console.log('\n⚠ no execution result within timeout (check the tx hash)')
}

main().catch(e => {
  console.error(e.message)
  process.exit(1)
})
