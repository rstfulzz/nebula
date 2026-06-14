/**
 * Aave V3 adapter for Mantle. Pool verified live (getReservesList returns the
 * supported markets). We expose supply / withdraw (writes, guarded by the
 * policy + simulate pipeline) and a read-only position view (health factor).
 */
import { type Address, type PublicClient, erc20Abi, parseAbi } from 'viem'
import { MULTICALL3 } from './constants'

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
    name: 'borrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'referralCode', type: 'uint16' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'repay',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
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

/** Full-balance sentinel for Aave withdraw (and full-debt sentinel for repay). */
export const AAVE_MAX_WITHDRAW = (1n << 256n) - 1n

/** Aave V3 interest rate mode: 2 = variable (stable rate mode is deprecated). */
export const AAVE_VARIABLE_RATE = 2n

/** getReserveData returns the V3 ReserveData struct; we read the two rate fields. */
const AAVE_RESERVE_DATA_ABI = parseAbi([
  'struct ReserveData { uint256 configuration; uint128 liquidityIndex; uint128 currentLiquidityRate; uint128 variableBorrowIndex; uint128 currentVariableBorrowRate; uint128 currentStableBorrowRate; uint40 lastUpdateTimestamp; uint16 id; address aTokenAddress; address stableDebtTokenAddress; address variableDebtTokenAddress; address interestRateStrategyAddress; uint128 accruedToTreasury; uint128 unbacked; uint128 isolationModeTotalDebt; }',
  'function getReserveData(address asset) view returns (ReserveData)',
  'function getReservesList() view returns (address[])',
])

const RAY = 10n ** 27n

/** Aave rates are per-second APR scaled to RAY (1e27). APR% = rate / 1e27 * 100. */
export function rayToAprPct(rateRay: bigint): number {
  return Number((rateRay * 1_000_000n) / RAY) / 10_000
}

export interface AaveMarket {
  symbol: string
  address: Address
  supplyAprPct: number
  variableBorrowAprPct: number
}

/** Read every Aave V3 reserve on Mantle with its live supply + variable-borrow APR. */
export async function readAaveMarkets(client: PublicClient, pool: Address): Promise<AaveMarket[]> {
  const reserves = (await client.readContract({
    address: pool,
    abi: AAVE_RESERVE_DATA_ABI,
    functionName: 'getReservesList',
  })) as readonly Address[]

  // One Multicall3 batch instead of 2N parallel calls (public RPCs rate-limit
  // a 20-call burst). For each reserve: getReserveData(pool) + symbol(asset).
  const contracts = reserves.flatMap(asset => [
    {
      address: pool,
      abi: AAVE_RESERVE_DATA_ABI,
      functionName: 'getReserveData' as const,
      args: [asset] as const,
    },
    { address: asset, abi: erc20Abi, functionName: 'symbol' as const },
  ])
  const results = await client.multicall({
    contracts,
    allowFailure: true,
    multicallAddress: MULTICALL3,
  })

  return reserves.map((asset, i) => {
    const dRes = results[i * 2]
    const symRes = results[i * 2 + 1]
    const d =
      dRes?.status === 'success'
        ? (dRes.result as { currentLiquidityRate: bigint; currentVariableBorrowRate: bigint })
        : { currentLiquidityRate: 0n, currentVariableBorrowRate: 0n }
    const symbol = symRes?.status === 'success' ? (symRes.result as string) : '?'
    return {
      symbol,
      address: asset,
      supplyAprPct: rayToAprPct(d.currentLiquidityRate),
      variableBorrowAprPct: rayToAprPct(d.currentVariableBorrowRate),
    }
  })
}

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
