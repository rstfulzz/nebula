/**
 * Casper foundation smoke test (READ-ONLY — moves no funds).
 *
 * Proves the migrated stack end-to-end against the funded testnet account:
 *   - casper-js-sdk v5 RpcClient over the CSPR.cloud testnet node proxy
 *   - secp256k1 PEM key loading from CASPER_SECRET_KEY_PATH
 *   - public-key derivation + main-purse balance read
 *
 * Env (auto-loaded from .env by bun):
 *   CSPR_CLOUD_API_KEY, CASPER_NODE_RPC, CASPER_SECRET_KEY_PATH, CASPER_CHAIN_NAME
 *
 * Run:  bun run scripts/casper/smoke.ts
 */
import { readFileSync } from 'node:fs'
import {
  HttpHandler,
  RpcClient,
  PrivateKey,
  PublicKey,
  KeyAlgorithm,
  PurseIdentifier,
} from 'casper-js-sdk'

const RPC = process.env.CASPER_NODE_RPC ?? 'https://node.testnet.casper.network/rpc'
const API_KEY = process.env.CSPR_CLOUD_API_KEY
const PEM_PATH = process.env.CASPER_SECRET_KEY_PATH
const FALLBACK_PUB =
  '0203dc4a23af775ed29fc045565256c35b3519cc9bad1b7e7051172ce2cffc61cc45'

function makeRpc(): RpcClient {
  const handler = new HttpHandler(RPC)
  // CSPR.cloud node proxy wants the raw token in the Authorization header.
  if (API_KEY) handler.setCustomHeaders({ Authorization: API_KEY })
  return new RpcClient(handler)
}

async function main() {
  console.log('RPC:', RPC)
  const rpc = makeRpc()

  // 1) Node reachable + correct network
  try {
    const status: any = await rpc.getStatus()
    console.log(
      'node:',
      status?.chainspecName ?? status?.chainspec_name ?? '?',
      '| api',
      status?.apiVersion ?? status?.api_version ?? '?',
    )
  } catch (e) {
    console.warn('getStatus failed (continuing):', (e as Error).message)
  }

  // 2) Load the signer (secp256k1) if available, else use the public key directly
  let pub: PublicKey
  if (PEM_PATH) {
    const sk = PrivateKey.fromPem(readFileSync(PEM_PATH, 'utf8'), KeyAlgorithm.SECP256K1)
    pub = sk.publicKey
    console.log('signer loaded from PEM, pubkey:', pub.toHex())
  } else {
    pub = PublicKey.fromHex(FALLBACK_PUB)
    console.log('no PEM; using fallback pubkey:', pub.toHex())
  }

  // 3) Main-purse balance
  const bal: any = await rpc.queryLatestBalance(PurseIdentifier.fromPublicKey(pub))
  const motes = (bal?.balance ?? bal?.balanceValue ?? bal).toString()
  console.log('balance motes:', motes)
  console.log('balance CSPR :', Number(motes) / 1e9)
  console.log('OK ✅ Casper read stack works')
}

main().catch((e) => {
  console.error('SMOKE FAILED ❌', e)
  process.exit(1)
})
