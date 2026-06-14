/**
 * Typed ABIs for plugin-onchain. Small ABIs use `parseAbi` inline so viem can
 * infer arg/return types. The big vendored JSON ABIs (SwapRouter, Quoter,
 * Factory) load via JSON import + `as Abi` cast — too large to inline,
 * generated from the canonical AGNI testnet artifacts (bytecode-equivalent
 * on mainnet, verified May 1 2026).
 */

import { type Abi, parseAbi } from 'viem'
import factoryJson from '../abis/factory.json' with { type: 'json' }
import quoterJson from '../abis/quoter.json' with { type: 'json' }
import swapRouterJson from '../abis/swap-router.json' with { type: 'json' }

export const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
])

export const WETH9_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 wad)',
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function transfer(address to, uint256 wad) returns (bool)',
  'function approve(address spender, uint256 wad) returns (bool)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
])

// `aggregate3` is `payable` on-chain but we only ever call it for batched
// reads (no msg.value). Marking it `view` here lets viem's `readContract`
// type-narrowing keep `aggregate3` callable; the runtime contract still
// accepts the call without msg.value.
export const MULTICALL3_ABI = parseAbi([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[] returnData)',
  'function getEthBalance(address addr) view returns (uint256 balance)',
  'function getBlockNumber() view returns (uint256 blockNumber)',
])

export const SWAP_ROUTER_ABI = swapRouterJson as Abi
export const QUOTER_ABI = quoterJson as Abi
export const FACTORY_ABI = factoryJson as Abi

/**
 * Merchant Moe Liquidity Book quoter. `findBestPathFromAmountIn` scans LB pairs
 * for the best route; the last element of `amounts` is the output. `binSteps`
 * + `versions` + `route` feed directly into the router's swap `Path`.
 */
export const LB_QUOTER_ABI = parseAbi([
  'struct Quote { address[] route; address[] pairs; uint256[] binSteps; uint8[] versions; uint128[] amounts; uint128[] virtualAmountsWithoutSlippage; uint128[] fees; }',
  'function findBestPathFromAmountIn(address[] route, uint128 amountIn) view returns (Quote)',
])

/**
 * Merchant Moe Liquidity Book router. The `Path` struct carries the per-hop bin
 * steps + pair versions (V1=0, V2=1, V2_1=2, V2_2=3) + token path returned by
 * the quoter. Native legs go through WNATIVE (WMNT) automatically.
 */
export const LB_ROUTER_ABI = parseAbi([
  'struct Path { uint256[] pairBinSteps; uint8[] versions; address[] tokenPath; }',
  'function getWNATIVE() view returns (address)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Path path, address to, uint256 deadline) returns (uint256 amountOut)',
  'function swapExactNATIVEForTokens(uint256 amountOutMin, Path path, address to, uint256 deadline) payable returns (uint256 amountOut)',
  'function swapExactTokensForNATIVE(uint256 amountIn, uint256 amountOutMinNATIVE, Path path, address to, uint256 deadline) returns (uint256 amountOut)',
])

/** All known function fragments concatenated, for `analysis.decodeCalldata`. */
export const ALL_KNOWN_ABIS: Abi = [
  ...(SWAP_ROUTER_ABI as readonly unknown[]),
  ...(QUOTER_ABI as readonly unknown[]),
  ...(FACTORY_ABI as readonly unknown[]),
  ...(WETH9_ABI as readonly unknown[]),
  ...(ERC20_ABI as readonly unknown[]),
  ...(MULTICALL3_ABI as readonly unknown[]),
] as Abi
