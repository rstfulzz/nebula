/**
 * Treasury budget actions — the delegated "one user, one wallet, one agent"
 * mode. The owner sets up an on-chain bounded budget (per-tx + daily caps) and
 * registers an agent key; the agent then spends from that budget with the
 * contract enforcing every cap on-chain.
 *
 * The Treasury package is `NEBULA_TREASURY_PACKAGE_HASH`. Entry points
 * (verified on-chain):
 *   register(agent_key, per_tx_cap, daily_cap)         — owner signs
 *   deposit()                  payable, cargo-purse     — owner signs (session)
 *   execute(owner, recipient, amount)                   — AGENT signs
 *   withdraw(amount)                                    — owner signs
 *
 * Caps + amounts are in MOTES. `register` uses U256; `execute`/`withdraw` use
 * U256; the cargo-purse `deposit` session uses U512 (matches the native
 * transfer it performs). The Treasury's `transfer_tokens` is gas-heavy, so the
 * session/execute/withdraw paths all pay 15 CSPR.
 */
import { readFileSync } from 'node:fs'
import {
  Args,
  CLValue,
  ContractCallBuilder,
  Key,
  type PrivateKey,
  PublicKey,
  type RpcClient,
  SessionBuilder,
} from 'casper-js-sdk'
import { casperConfigFromEnv } from './config'

export interface TreasuryResult {
  hash: string
  explorer: string
}

function extractHash(res: unknown): string {
  const r = res as { transactionHash?: { toHex?(): string }; deployHash?: { toHex?(): string } }
  const raw = r?.transactionHash ?? r?.deployHash ?? res
  return (raw as { toHex?(): string })?.toHex?.() ?? String(raw)
}

/** Treasury package hash → the 32-byte hex used by `byPackageHash`. */
function pkgHex(treasuryPkg: string): string {
  return treasuryPkg.replace(/^hash-/, '')
}

/** A public key hex → its account-hash `Key` (the contract's owner/agent/recipient shape). */
function accountKey(publicKeyHex: string): Key {
  return Key.newKey(PublicKey.fromHex(publicKeyHex).accountHash().toPrefixedString())
}

export interface TreasuryRegisterParams {
  /** Treasury contract package hash (`hash-…`). */
  treasuryPkg: string
  /** The agent public key that will be allowed to spend from the budget. */
  agentPublicKeyHex: string
  /** Per-transaction cap, in motes. */
  perTxCapMotes: bigint
  /** Rolling 24h cap, in motes. */
  dailyCapMotes: bigint
  paymentMotes?: number
}

/**
 * Register the agent key + caps against the owner's budget. The owner signs; the
 * contract records `get_caller` as the owner. ~5 CSPR is plenty of gas.
 */
export async function treasuryRegister(
  rpc: RpcClient,
  ownerSigner: PrivateKey,
  p: TreasuryRegisterParams,
): Promise<TreasuryResult> {
  const cfg = casperConfigFromEnv()
  const tx = new ContractCallBuilder()
    .from(ownerSigner.publicKey)
    .chainName(cfg.chainName)
    .byPackageHash(pkgHex(p.treasuryPkg))
    .entryPoint('register')
    .runtimeArgs(
      Args.fromMap({
        agent_key: CLValue.newCLKey(accountKey(p.agentPublicKeyHex)),
        per_tx_cap: CLValue.newCLUInt256(p.perTxCapMotes.toString()),
        daily_cap: CLValue.newCLUInt256(p.dailyCapMotes.toString()),
      }),
    )
    .payment(p.paymentMotes ?? 5_000_000_000)
    .build()
  tx.sign(ownerSigner)
  const hash = extractHash(await rpc.putTransaction(tx))
  return { hash, explorer: `${cfg.explorer}/transaction/${hash}` }
}

export interface TreasuryDepositParams {
  /** Treasury contract package hash (`hash-…`). */
  treasuryPkg: string
  /** Amount to fund the budget with, in motes. */
  amountMotes: bigint
  /** Path to `deposit_session.wasm` (the cargo-purse session). */
  wasmPath: string
  paymentMotes?: number
}

/**
 * Fund the owner's budget via the cargo-purse deposit session. Casper contracts
 * can only receive CSPR through a cargo purse and casper-js-sdk can't attach
 * value to a plain contract call, so this deploys `deposit_session.wasm`
 * (create purse → fund it → call the Treasury's payable `deposit()` with
 * `cargo_purse`). The session args are `amount: U512` (motes) and
 * `treasury: ByteArray(32)` (raw package-hash bytes). 15 CSPR of gas.
 */
export async function treasuryDeposit(
  rpc: RpcClient,
  ownerSigner: PrivateKey,
  p: TreasuryDepositParams,
): Promise<TreasuryResult> {
  const cfg = casperConfigFromEnv()
  const wasm = new Uint8Array(readFileSync(p.wasmPath))
  const treasuryBytes = Uint8Array.from(Buffer.from(pkgHex(p.treasuryPkg), 'hex')) // 32-byte pkg hash
  const tx = new SessionBuilder()
    .from(ownerSigner.publicKey)
    .chainName(cfg.chainName)
    .wasm(wasm)
    .runtimeArgs(
      Args.fromMap({
        amount: CLValue.newCLUInt512(p.amountMotes.toString()),
        treasury: CLValue.newCLByteArray(treasuryBytes),
      }),
    )
    .payment(p.paymentMotes ?? 15_000_000_000)
    .build()
  tx.sign(ownerSigner)
  const hash = extractHash(await rpc.putTransaction(tx))
  return { hash, explorer: `${cfg.explorer}/transaction/${hash}` }
}

export interface TreasuryExecuteParams {
  /** Treasury contract package hash (`hash-…`). */
  treasuryPkg: string
  /** The owner whose budget the spend draws from. */
  ownerPublicKeyHex: string
  /** Payout recipient. */
  recipientPublicKeyHex: string
  /** Amount to send, in motes. */
  amountMotes: bigint
  paymentMotes?: number
}

/**
 * Spend from the owner's budget. The AGENT key signs; the contract reverts if
 * the caller isn't the registered agent (`Unauthorized`), or the spend is over
 * the per-tx / daily cap, the treasury is paused, or the budget is too low.
 * 15 CSPR of gas (the contract's `transfer_tokens` is gas-heavy).
 */
export async function treasuryExecute(
  rpc: RpcClient,
  agentSigner: PrivateKey,
  p: TreasuryExecuteParams,
): Promise<TreasuryResult> {
  const cfg = casperConfigFromEnv()
  const tx = new ContractCallBuilder()
    .from(agentSigner.publicKey)
    .chainName(cfg.chainName)
    .byPackageHash(pkgHex(p.treasuryPkg))
    .entryPoint('execute')
    .runtimeArgs(
      Args.fromMap({
        owner: CLValue.newCLKey(accountKey(p.ownerPublicKeyHex)),
        recipient: CLValue.newCLKey(accountKey(p.recipientPublicKeyHex)),
        amount: CLValue.newCLUInt256(p.amountMotes.toString()),
      }),
    )
    .payment(p.paymentMotes ?? 15_000_000_000)
    .build()
  tx.sign(agentSigner)
  const hash = extractHash(await rpc.putTransaction(tx))
  return { hash, explorer: `${cfg.explorer}/transaction/${hash}` }
}

export interface TreasuryWithdrawParams {
  /** Treasury contract package hash (`hash-…`). */
  treasuryPkg: string
  /** Amount to pull back to the owner, in motes. */
  amountMotes: bigint
  paymentMotes?: number
}

/**
 * Owner pulls funds back out of their budget. The owner signs. 15 CSPR of gas
 * (the contract's `transfer_tokens` is gas-heavy).
 */
export async function treasuryWithdraw(
  rpc: RpcClient,
  ownerSigner: PrivateKey,
  p: TreasuryWithdrawParams,
): Promise<TreasuryResult> {
  const cfg = casperConfigFromEnv()
  const tx = new ContractCallBuilder()
    .from(ownerSigner.publicKey)
    .chainName(cfg.chainName)
    .byPackageHash(pkgHex(p.treasuryPkg))
    .entryPoint('withdraw')
    .runtimeArgs(
      Args.fromMap({
        amount: CLValue.newCLUInt256(p.amountMotes.toString()),
      }),
    )
    .payment(p.paymentMotes ?? 15_000_000_000)
    .build()
  tx.sign(ownerSigner)
  const hash = extractHash(await rpc.putTransaction(tx))
  return { hash, explorer: `${cfg.explorer}/transaction/${hash}` }
}
