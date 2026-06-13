/**
 * Aave V3 adapter for Mantle. Pool verified live (getReservesList returns the
 * supported markets). We expose supply / withdraw (writes, guarded by the
 * policy + simulate pipeline) and a read-only position view (health factor).
 */
import type { Address, PublicClient } from 'viem'

export const AAVE_V3_POOL_ABI = [
  {
    name: 'supply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
      { name: 'referralCode', type: 'uint16' },
    ],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
  {
    name: 'getReservesList',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address[]' }],
  },
] as const

/** Full-balance sentinel for Aave withdraw. */
export const AAVE_MAX_WITHDRAW = (1n << 256n) - 1n

export interface AaveAccount {
  totalCollateralBase: bigint
  totalDebtBase: bigint
  availableBorrowsBase: bigint
  liquidationThresholdBps: bigint
  ltvBps: bigint
  healthFactorRaw: bigint
}

/** Human health factor — '∞ (no debt)' when there is no borrow, else 1e18-scaled. */
export function formatHealthFactor(raw: bigint): string {
  if (raw >= AAVE_MAX_WITHDRAW) return '∞ (no debt)'
  const whole = raw / 10n ** 18n
  const frac = ((raw % 10n ** 18n) * 100n) / 10n ** 18n
  return `${whole.toString()}.${frac.toString().padStart(2, '0')}`
}

/** Aave base currency is USD with 8 decimals on this market. */
export function formatBaseUsd(base: bigint): string {
  const whole = base / 10n ** 8n
  const frac = ((base % 10n ** 8n) * 100n) / 10n ** 8n
  return `$${whole.toString()}.${frac.toString().padStart(2, '0')}`
}

export async function readAaveAccount(
  client: PublicClient,
  pool: Address,
  user: Address,
): Promise<AaveAccount> {
  const d = (await client.readContract({
    address: pool,
    abi: AAVE_V3_POOL_ABI,
    functionName: 'getUserAccountData',
    args: [user],
  })) as readonly bigint[]
  return {
    totalCollateralBase: d[0] ?? 0n,
    totalDebtBase: d[1] ?? 0n,
    availableBorrowsBase: d[2] ?? 0n,
    liquidationThresholdBps: d[3] ?? 0n,
    ltvBps: d[4] ?? 0n,
    healthFactorRaw: d[5] ?? 0n,
  }
}
