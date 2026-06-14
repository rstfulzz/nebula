import { describe, expect, test } from 'bun:test'
import { type Address, type PublicClient, decodeFunctionData } from 'viem'
import { LB_ROUTER_ABI } from './abis'
import { type MoeQuote, encodeMoeSwap, quoteMoe } from './moe'

const WMNT = '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8' as Address
const USDC = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9' as Address
const AGENT = '0x1e930c1647EaB93651FD94e760E0cbbb5F4FC99f' as Address

const QUOTE: MoeQuote = {
  route: [WMNT, USDC],
  binSteps: [0n],
  versions: [0],
  amountOut: 550142n,
}

function fakeQuoter(amounts: bigint[]): PublicClient {
  return {
    readContract: async () => ({
      route: [WMNT, USDC],
      pairs: ['0x0000000000000000000000000000000000000abc'],
      binSteps: [0n],
      versions: [0],
      amounts,
      virtualAmountsWithoutSlippage: amounts,
      fees: [0n],
    }),
  } as unknown as PublicClient
}

describe('quoteMoe', () => {
  test('returns the last amounts element as amountOut', async () => {
    const q = await quoteMoe({
      client: fakeQuoter([10n ** 18n, 550142n]),
      quoter: '0x501b8AFd35df20f531fF45F6f695793AC3316c85',
      route: [WMNT, USDC],
      amountIn: 10n ** 18n,
    })
    expect(q).not.toBeNull()
    expect(q?.amountOut).toBe(550142n)
    expect(q?.route).toEqual([WMNT, USDC])
  })

  test('returns null when output is zero (no liquidity)', async () => {
    const q = await quoteMoe({
      client: fakeQuoter([10n ** 18n, 0n]),
      quoter: '0x501b8AFd35df20f531fF45F6f695793AC3316c85',
      route: [WMNT, USDC],
      amountIn: 10n ** 18n,
    })
    expect(q).toBeNull()
  })
})

describe('encodeMoeSwap', () => {
  const base = {
    quote: QUOTE,
    amountIn: 10n ** 18n,
    amountOutMin: 540000n,
    to: AGENT,
    deadline: 9_999_999_999n,
  }

  test('native IN encodes swapExactNATIVEForTokens with msg.value = amountIn', () => {
    const out = encodeMoeSwap({ ...base, nativeIn: true, nativeOut: false })
    expect(out.value).toBe(10n ** 18n)
    const decoded = decodeFunctionData({ abi: LB_ROUTER_ABI, data: out.data })
    expect(decoded.functionName).toBe('swapExactNATIVEForTokens')
  })

  test('native OUT encodes swapExactTokensForNATIVE with zero value', () => {
    const out = encodeMoeSwap({ ...base, nativeIn: false, nativeOut: true })
    expect(out.value).toBe(0n)
    const decoded = decodeFunctionData({ abi: LB_ROUTER_ABI, data: out.data })
    expect(decoded.functionName).toBe('swapExactTokensForNATIVE')
  })

  test('ERC-20 ↔ ERC-20 encodes swapExactTokensForTokens with zero value', () => {
    const out = encodeMoeSwap({ ...base, nativeIn: false, nativeOut: false })
    expect(out.value).toBe(0n)
    const decoded = decodeFunctionData({ abi: LB_ROUTER_ABI, data: out.data })
    expect(decoded.functionName).toBe('swapExactTokensForTokens')
    // Path struct carries the quoted bin steps + versions + token path.
    const path = decoded.args[2] as { pairBinSteps: bigint[]; versions: number[]; tokenPath: Address[] }
    expect(path.tokenPath).toEqual([WMNT, USDC])
    expect(path.pairBinSteps).toEqual([0n])
    expect(path.versions).toEqual([0])
  })
})
