// Keyless treasury routing for the CLI/gateway (mirrors the web).
//
// When a Safe treasury + ScopedAgentModule are configured, every on-chain WRITE
// is wrapped as `module.exec(to, value, data)` — bounded on-chain by the module's
// allowlist + per-tx cap. The operator/agent key only needs to be the module's
// `agent`; the treasury (the Safe) holds the funds and the owner keeps full
// control + revocation. Reads should target the Safe (set agentEoa = the Safe).
//
// Implemented as a transparent wrapper over the viem WalletClient so the ~12
// scattered send sites in the tools need no changes: their sendTransaction /
// writeContract calls are intercepted and re-routed through the module.

import { type Address, type Hex, type WalletClient, encodeFunctionData, parseAbi } from 'viem'

export const SCOPED_MODULE_ABI = parseAbi([
  'function exec(address to, uint256 value, bytes data) returns (bytes)',
])

export interface TreasuryConfig {
  /** The Safe treasury address (also the read subject / agentEoa in treasury mode). */
  safe: Address
  /** The ScopedAgentModule that bounds the agent on-chain. */
  module: Address
}

/** Read treasury config from env. Returns null when keyless treasury mode is off. */
export function treasuryFromEnv(): TreasuryConfig | null {
  const safe = process.env.NEBULA_TREASURY_SAFE
  const mod = process.env.NEBULA_TREASURY_MODULE
  if (!safe || !mod) return null
  return { safe: safe as Address, module: mod as Address }
}

/** Wrap a WalletClient so every write routes through the ScopedAgentModule → Safe.
 *  Pass-through for everything else (signing, reads, account, chain). */
export function wrapWalletClientForTreasury(wc: WalletClient, moduleAddr: Address): WalletClient {
  const toExec = (to: Address, value: bigint, data: Hex) =>
    encodeFunctionData({ abi: SCOPED_MODULE_ABI, functionName: 'exec', args: [to, value, data] })

  return new Proxy(wc, {
    get(target, prop, receiver) {
      if (prop === 'sendTransaction') {
        // biome-ignore lint/suspicious/noExplicitAny: viem SendTransactionParameters
        return (args: any) => {
          const data = toExec(
            args.to as Address,
            BigInt(args.value ?? 0n),
            (args.data ?? '0x') as Hex,
          )
          // biome-ignore lint/suspicious/noExplicitAny: re-dispatch through the original client
          return (target as any).sendTransaction({
            account: args.account,
            chain: args.chain,
            to: moduleAddr,
            value: 0n,
            data,
            ...(args.gasPrice ? { gasPrice: args.gasPrice } : {}),
          })
        }
      }
      if (prop === 'writeContract') {
        // biome-ignore lint/suspicious/noExplicitAny: viem WriteContractParameters
        return (args: any) => {
          const inner = encodeFunctionData({
            abi: args.abi,
            functionName: args.functionName,
            args: args.args,
          })
          const data = toExec(args.address as Address, BigInt(args.value ?? 0n), inner)
          // biome-ignore lint/suspicious/noExplicitAny: re-dispatch through the original client
          return (target as any).sendTransaction({
            account: args.account,
            chain: args.chain,
            to: moduleAddr,
            value: 0n,
            data,
            ...(args.gasPrice ? { gasPrice: args.gasPrice } : {}),
          })
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as WalletClient
}
