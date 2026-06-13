/**
 * Simulate-before-write guard.
 *
 * Nebula's core safety rule (project thesis): every state-changing transaction
 * is dry-run against the live chain BEFORE it is broadcast, so reverts and
 * insufficient-funds are caught pre-flight and surfaced to the operator instead
 * of burning gas on a doomed tx. Read-only — no transaction is sent here.
 */

import {
  type Abi,
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  type PublicClient,
} from 'viem'

export interface SimOk {
  ok: true
  /** Estimated gas for the (validated) transaction. */
  gas: bigint
}
export interface SimFail {
  ok: false
  /** Decoded revert reason or node error (truncated). */
  reason: string
}
export type SimResult = SimOk | SimFail

/** Pull a human revert reason out of a viem error chain. */
function extractRevert(e: unknown): string {
  if (e instanceof BaseError) {
    const reverted = e.walk((err) => err instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      return reverted.reason ?? reverted.shortMessage ?? 'reverted'
    }
    return e.shortMessage ?? e.message.slice(0, 200)
  }
  return (e as Error)?.message?.slice(0, 200) ?? 'unknown simulation error'
}

/**
 * Dry-run a native-value send. `estimateGas` both validates the call and
 * catches insufficient-funds (`gas * price + value > balance`).
 */
export async function simulateNativeSend(
  client: PublicClient,
  args: { account: Address; to: Address; value: bigint },
): Promise<SimResult> {
  try {
    const gas = await client.estimateGas({
      account: args.account,
      to: args.to,
      value: args.value,
    })
    return { ok: true, gas }
  } catch (e) {
    return { ok: false, reason: extractRevert(e) }
  }
}

/**
 * Dry-run a contract write (e.g. ERC-20 transfer, a DEX swap). `simulateContract`
 * decodes custom-error/`require` reverts; `estimateContractGas` adds the gas
 * figure and catches funding shortfalls.
 */
export async function simulateContractWrite(
  client: PublicClient,
  args: {
    account: Address
    address: Address
    abi: Abi
    functionName: string
    args: readonly unknown[]
    value?: bigint
  },
): Promise<SimResult> {
  try {
    await client.simulateContract({
      account: args.account,
      address: args.address,
      abi: args.abi,
      functionName: args.functionName,
      args: args.args,
      ...(args.value !== undefined ? { value: args.value } : {}),
    })
    const gas = await client.estimateContractGas({
      account: args.account,
      address: args.address,
      abi: args.abi,
      functionName: args.functionName,
      args: args.args,
      ...(args.value !== undefined ? { value: args.value } : {}),
    })
    return { ok: true, gas }
  } catch (e) {
    return { ok: false, reason: extractRevert(e) }
  }
}
