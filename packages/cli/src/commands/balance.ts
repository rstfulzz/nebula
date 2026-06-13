import {
  type NebulaNetwork,
  NETWORK_RPC,
  format0G,
  getLedgerDetailReadOnly,
  getSandboxBillingReserve,
} from 'nebula-ai-core'
import { http, type Address, createPublicClient } from 'viem'
import { findAndLoadConfig } from '../config/load'

export interface BalanceOpts {
  agent?: string
  cwd?: string
}

/**
 * Operator-facing aggregator for the agent's full economic position. Mirrors
 * `account.balance` brain tool but renders for terminals.
 *
 * Why: pre-v0.21.9, getting a full picture took `cast balance` × 2 networks +
 * `nebula ledger balance` (needs unlock) + a separate cast for sandbox billing.
 * Operators kept under-counting by ~10x because the locked-in-providers split
 * wasn't surfaced anywhere.
 */
export async function runBalance(opts: BalanceOpts): Promise<void> {
  const found = await findAndLoadConfig(opts.cwd)
  if (!found) {
    console.error('No nebula.config.ts found. Run `nebula init` first.')
    process.exit(1)
  }
  const { config } = found
  const agentAddress = (opts.agent ?? config.identity.agent) as Address | undefined
  if (!agentAddress) {
    console.error('No agent address. Run `nebula init` first or pass `--agent 0x...`.')
    process.exit(1)
  }

  const network = config.network as NebulaNetwork
  const operatorAddress = config.identity.operator as Address | undefined
  const isSandbox = config.deployTarget === 'sandbox'

  const mainnetClient = createPublicClient({ transport: http(NETWORK_RPC['mantle-mainnet']) })
  const testnetClient = createPublicClient({ transport: http(NETWORK_RPC['mantle-testnet']) })

  const [eoaMainnetWei, eoaTestnetWei, ledger, sandboxReserve] = await Promise.all([
    mainnetClient.getBalance({ address: agentAddress }).catch(() => 0n),
    testnetClient.getBalance({ address: agentAddress }).catch(() => 0n),
    getLedgerDetailReadOnly({ network, agentAddress }).catch(() => null),
    isSandbox && operatorAddress
      ? getSandboxBillingReserve({ recipient: operatorAddress }).catch(() => 0n)
      : Promise.resolve(null),
  ])

  console.log('')
  console.log(`agent       ${agentAddress}${config.subname ? ` (${config.subname}.nebula.0g)` : ''}`)
  console.log(`network     ${network}`)
  console.log(`target      ${config.deployTarget ?? 'local'}`)
  console.log('')
  console.log('mainnet (chain 16661)')
  console.log(`  EOA balance               ${format0G(eoaMainnetWei)} Mantle`)
  if (ledger) {
    console.log(`  compute ledger total      ${format0G(ledger.totalBalance)} Mantle`)
    console.log(`    available               ${format0G(ledger.availableBalance)} Mantle`)
    console.log(`    locked in providers     ${format0G(ledger.lockedBalance)} Mantle`)
  } else {
    console.log('  compute ledger            (not opened — call `nebula topup --compute N` to seed)')
  }
  console.log('')
  console.log('testnet/galileo (chain 16602)')
  console.log(`  EOA balance               ${format0G(eoaTestnetWei)} Mantle`)
  if (isSandbox && operatorAddress) {
    if (sandboxReserve !== null) {
      console.log(
        `  sandbox billing reserve   ${format0G(sandboxReserve)} Mantle  (operator ${operatorAddress})`,
      )
    } else {
      console.log('  sandbox billing reserve   (unavailable — RPC error)')
    }
  } else if (isSandbox) {
    console.log('  sandbox billing reserve   (operator address missing in config)')
  }

  console.log('')
  console.log('position summary')
  const mainnetTotal = eoaMainnetWei + (ledger?.totalBalance ?? 0n)
  const testnetTotal = eoaTestnetWei + (sandboxReserve ?? 0n)
  console.log(`  mainnet total             ${format0G(mainnetTotal)} Mantle  (EOA + ledger)`)
  console.log(`  testnet total             ${format0G(testnetTotal)} Mantle  (EOA + sandbox reserve)`)

  const warnings: string[] = []
  if (eoaMainnetWei < 2_000_000_000_000_000_000n) {
    warnings.push(
      'EOA mainnet below 2 Mantle notify threshold — auto-topup will fire wallet-low events',
    )
  }
  if (ledger && ledger.availableBalance < 500_000_000_000_000_000n) {
    warnings.push(
      'Compute ledger available below 0.5 Mantle — auto-topup may transfer from EOA into provider envelopes',
    )
  }
  if (isSandbox && sandboxReserve !== null && sandboxReserve < 1_000_000_000_000_000_000n) {
    warnings.push(
      'Sandbox billing reserve below 1 Mantle — top up via `nebula topup --sandbox N` to extend container runtime',
    )
  }
  if (warnings.length) {
    console.log('')
    console.log('warnings')
    for (const w of warnings) console.log(`  · ${w}`)
  }
  console.log('')
}
