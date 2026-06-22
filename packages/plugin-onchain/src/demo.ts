/**
 * Casper agent demo — exercises the on-chain tools exactly as the brain would
 * call them, proving the "verifiable autonomy" pipeline on testnet:
 *   reads -> deterministic policy BLOCK -> approval gate -> real verified transfer.
 *
 * Run:  bun run packages/plugin-onchain/src/demo.ts
 */
import { PrivateKey, KeyAlgorithm } from 'casper-js-sdk'
import { buildCasperOnchainFromEnv } from './context'
import { casperTools } from './index'
import { csprToMotes } from './config'

const ctx = buildCasperOnchainFromEnv({
  // Demo policy: cap 100 CSPR/tx, auto-execute <= 5 CSPR, else require approval.
  policy: {
    autonomy: 'auto',
    maxNativeMotesPerTx: csprToMotes(100),
    autoMaxNativeMotesPerTx: csprToMotes(5),
  },
})
const tools = Object.fromEntries(casperTools(ctx).map((t) => [t.name, t]))

async function run(name: string, args: Record<string, unknown> = {}) {
  const r = await tools[name].handler(args as never)
  const tag = r.ok ? '✅' : '⛔'
  console.log(`\n▶ ${name}(${JSON.stringify(args)}) ${tag}`)
  console.log(JSON.stringify(r, null, 2))
  return r
}

console.log('=== Casper agent demo (testnet) ===')
await run('casper.status')
await run('casper.policy')
await run('casper.balance')
await run('casper.validators', { limit: 3 })

const recipient = (await PrivateKey.generate(KeyAlgorithm.ED25519)).publicKey.toHex()
console.log('\n-- policy enforcement --')
await run('casper.send', { to: recipient, amount: 200 }) // BLOCKED: over 100 cap
await run('casper.send', { to: recipient, amount: 10 }) // APPROVAL: over 5 auto-ceiling
console.log('\n-- real on-chain transfer (auto, <= 5 CSPR) --')
await run('casper.send', { to: recipient, amount: 2.5 }) // EXECUTES + verifies

console.log('\n=== demo done ===')
