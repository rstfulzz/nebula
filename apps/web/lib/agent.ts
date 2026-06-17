// Server-side nebula agent for the web console. Runs a real OpenAI tool-calling
// loop over live Mantle reads (viem) + a policy-gated MNT send. Self-contained
// (no bun-native package imports) so it runs on a plain Node host.
import 'server-only'

import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  isAddress,
  parseAbi,
  parseEther,
  parseUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getReputation, resolveAgent } from '@/lib/chain/erc8004'

const mantle = defineChain({
  id: 5000,
  name: 'Mantle',
  nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mantle.xyz'] } },
})
const pub = createPublicClient({ chain: mantle, transport: http() })
const USDC: Address = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9'
const WMNT: Address = '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8'
const WETH9_ABI = [
  { type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'wad', type: 'uint256' }],
    outputs: [],
  },
] as const

// Aave V3 Pool on Mantle (verified live; ported from the CLI's plugin-onchain).
const AAVE_POOL: Address = '0x458F293454fE0d67EC0655f3672301301DD51422'
const AAVE_POOL_ABI = [
  {
    type: 'function',
    name: 'supply',
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
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'borrow',
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
    type: 'function',
    name: 'repay',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const
const MAX_UINT256 = (2n ** 256n - 1n).toString()

// ERC-20 reserves suppliable/borrowable on Aave Mantle (native MNT must be WMNT).
const AAVE_TOKENS: Record<string, { address: Address; decimals: number }> = {
  WMNT: { address: WMNT, decimals: 18 },
  USDC: { address: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', decimals: 6 },
  USDT: { address: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE', decimals: 6 },
  WETH: { address: '0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111', decimals: 18 },
  METH: { address: '0xcDA86A272531e8640cD7F1a92c01839911B90bb0', decimals: 18 },
}

/** Returns an approve PendingAction if `owner`'s allowance to `spender` is below
 *  `amount`, else null. Shared by swap + aave-supply/repay. */
async function approveIfNeeded(
  token: Address,
  spender: Address,
  amount: bigint,
  owner: Address,
  label: string,
): Promise<Record<string, unknown> | null> {
  const allowance = (await pub
    .readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] })
    .catch(() => 0n)) as bigint
  if (allowance >= amount) return null
  return {
    proposed: true,
    kind: 'approve',
    from: owner,
    to: token,
    valueWei: '0',
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] }),
    amount: '',
    label,
    note: 'Approval needed first. After the user confirms it, run the original action again to execute.',
  }
}

function signer() {
  const pk = process.env.NEBULA_SIGNER_PRIVATE_KEY
  if (!pk) return null
  const account = privateKeyToAccount(pk as `0x${string}`)
  return { account, wallet: createWalletClient({ account, chain: mantle, transport: http() }) }
}

const MAX_NATIVE_MNT = Number(process.env.NEBULA_POLICY_MAX_NATIVE_MNT ?? '2')

// Major Mantle tokens: balances (balanceOf) + DeFiLlama price ids (live USD).
// MNT/WMNT share the native price id.
const TOKENS: { symbol: string; address: Address | 'native'; decimals: number; priceId: string }[] = [
  { symbol: 'MNT', address: 'native', decimals: 18, priceId: 'coingecko:mantle' },
  { symbol: 'WMNT', address: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8', decimals: 18, priceId: 'coingecko:mantle' },
  { symbol: 'USDC', address: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', decimals: 6, priceId: 'mantle:0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9' },
  { symbol: 'USDT', address: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE', decimals: 6, priceId: 'mantle:0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE' },
  { symbol: 'METH', address: '0xcDA86A272531e8640cD7F1a92c01839911B90bb0', decimals: 18, priceId: 'mantle:0xcDA86A272531e8640cD7F1a92c01839911B90bb0' },
  { symbol: 'WETH', address: '0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111', decimals: 18, priceId: 'mantle:0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111' },
  // Verified on Mantle RPC (address + decimals), Jun 2026. priceId via DeFiLlama.
  { symbol: 'FBTC', address: '0xC96dE26018A54D51c097160568752c4E3BD6C364', decimals: 8, priceId: 'mantle:0xC96dE26018A54D51c097160568752c4E3BD6C364' },
  { symbol: 'CMETH', address: '0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA', decimals: 18, priceId: 'mantle:0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA' },
  { symbol: 'AUSD', address: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', decimals: 6, priceId: 'mantle:0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a' },
  { symbol: 'USDE', address: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', decimals: 18, priceId: 'mantle:0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34' },
  { symbol: 'SUSDE', address: '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2', decimals: 18, priceId: 'mantle:0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2' },
]
// symbol → DeFiLlama price id (used by swap_quote).
const PRICE_IDS: Record<string, string> = Object.fromEntries(TOKENS.map(t => [t.symbol, t.priceId]))

// Native MNT sentinel used by DEX aggregators.
const NATIVE_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
// symbol → {address, decimals} for swap execution (MNT = native sentinel).
const SWAP_TOKENS: Record<string, { address: string; decimals: number }> = {
  MNT: { address: NATIVE_SENTINEL, decimals: 18 },
  WMNT: { address: WMNT, decimals: 18 },
  USDC: { address: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', decimals: 6 },
  USDT: { address: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE', decimals: 6 },
  METH: { address: '0xcDA86A272531e8640cD7F1a92c01839911B90bb0', decimals: 18 },
  WETH: { address: '0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111', decimals: 18 },
  FBTC: { address: '0xC96dE26018A54D51c097160568752c4E3BD6C364', decimals: 8 },
  CMETH: { address: '0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA', decimals: 18 },
  AUSD: { address: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', decimals: 6 },
  USDE: { address: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', decimals: 18 },
  SUSDE: { address: '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2', decimals: 18 },
}

// Stargate V2 USDC bridge from Mantle. Pool verified on Mantle RPC (token()=USDC,
// sharedDecimals=6). Destination EIDs are standard LayerZero V2 endpoint ids.
const STARGATE_USDC_POOL: Address = '0xAc290Ad4e0c891FDc295ca4F0a6214cf6dC6acDC'
const BRIDGE_EIDS: Record<string, number> = {
  ETHEREUM: 30101, ETH: 30101, ARBITRUM: 30110, ARB: 30110, OPTIMISM: 30111, OP: 30111,
  BASE: 30184, BNB: 30102, BSC: 30102, POLYGON: 30109, MATIC: 30109,
}
const SEND_PARAM = [
  { name: 'dstEid', type: 'uint32' },
  { name: 'to', type: 'bytes32' },
  { name: 'amountLD', type: 'uint256' },
  { name: 'minAmountLD', type: 'uint256' },
  { name: 'extraOptions', type: 'bytes' },
  { name: 'composeMsg', type: 'bytes' },
  { name: 'oftCmd', type: 'bytes' },
] as const
const MESSAGING_FEE = [
  { name: 'nativeFee', type: 'uint256' },
  { name: 'lzTokenFee', type: 'uint256' },
] as const
const STARGATE_ABI = [
  {
    type: 'function',
    name: 'quoteSend',
    stateMutability: 'view',
    inputs: [
      { name: '_sendParam', type: 'tuple', components: SEND_PARAM },
      { name: '_payInLzToken', type: 'bool' },
    ],
    outputs: [{ name: '', type: 'tuple', components: MESSAGING_FEE }],
  },
  {
    type: 'function',
    name: 'sendToken',
    stateMutability: 'payable',
    inputs: [
      { name: '_sendParam', type: 'tuple', components: SEND_PARAM },
      { name: '_fee', type: 'tuple', components: MESSAGING_FEE },
      { name: '_refundAddress', type: 'address' },
    ],
    outputs: [],
  },
] as const

// Merchant Moe (Liquidity Book) — the Mantle-native DEX used for real swaps.
// Router + quoter cross-verified on-chain (same addresses the nebula CLI uses).
// We route directly through Merchant Moe instead of an aggregator so the swap
// the user signs is exactly the route we quoted (and it actually executes).
const MOE_LB_ROUTER: Address = '0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a'
const MOE_LB_QUOTER: Address = '0x501b8AFd35df20f531fF45F6f695793AC3316c85'
const LB_QUOTER_ABI = parseAbi([
  'struct Quote { address[] route; address[] pairs; uint256[] binSteps; uint8[] versions; uint128[] amounts; uint128[] virtualAmountsWithoutSlippage; uint128[] fees; }',
  'function findBestPathFromAmountIn(address[] route, uint128 amountIn) view returns (Quote)',
])
const LB_ROUTER_ABI = parseAbi([
  'struct Path { uint256[] pairBinSteps; uint8[] versions; address[] tokenPath; }',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Path path, address to, uint256 deadline) returns (uint256 amountOut)',
  'function swapExactNATIVEForTokens(uint256 amountOutMin, Path path, address to, uint256 deadline) payable returns (uint256 amountOut)',
  'function swapExactTokensForNATIVE(uint256 amountIn, uint256 amountOutMinNATIVE, Path path, address to, uint256 deadline) returns (uint256 amountOut)',
])

interface MoeQuote {
  route: readonly Address[]
  binSteps: readonly bigint[]
  versions: readonly number[]
  amountOut: bigint
}

/** Quote `amountIn` of route[0]→route[last] via the Merchant Moe LB quoter.
 *  Returns null when no LB route has liquidity (amountOut == 0). */
async function quoteMoeLB(route: readonly Address[], amountIn: bigint): Promise<MoeQuote | null> {
  const q = (await pub.readContract({
    address: MOE_LB_QUOTER,
    abi: LB_QUOTER_ABI,
    functionName: 'findBestPathFromAmountIn',
    args: [route as Address[], amountIn],
  })) as {
    route: readonly Address[]
    binSteps: readonly bigint[]
    versions: readonly number[]
    amounts: readonly bigint[]
  }
  const amountOut = q.amounts.length > 0 ? q.amounts[q.amounts.length - 1]! : 0n
  if (amountOut === 0n) return null
  return { route: q.route, binSteps: q.binSteps, versions: q.versions, amountOut }
}

async function fetchPrices(ids: string[]): Promise<Record<string, number>> {
  const uniq = Array.from(new Set(ids)).join(',')
  const json = (await fetch(`https://coins.llama.fi/prices/current/${uniq}`)
    .then(r => r.json())
    .catch(() => ({}))) as { coins?: Record<string, { price?: number }> }
  const out: Record<string, number> = {}
  for (const [id, v] of Object.entries(json.coins ?? {})) if (v?.price) out[id] = v.price
  return out
}

// ─── tool specs (OpenAI function-calling) ──
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_balance',
      description: 'Get the MNT (native) and USDC balance of an address on Mantle.',
      parameters: {
        type: 'object',
        properties: { address: { type: 'string', description: '0x address. Defaults to the agent wallet.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gas_price',
      description: 'Current Mantle gas price + the MNT cost of a simple transfer.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'defi_yields',
      description: 'Top Mantle DeFi pools by APY (DeFiLlama), with TVL. Read-only discovery.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'How many pools (default 5).' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'portfolio',
      description:
        "Full token portfolio for an address on Mantle: balances of the major tokens (MNT, WMNT, USDC, USDT, mETH, WETH) with live USD values and a total. Defaults to the user's connected wallet — use this for 'my portfolio / my treasury / my positions'.",
      parameters: {
        type: 'object',
        properties: { address: { type: 'string', description: '0x address. Defaults to the connected wallet.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'swap_quote',
      description:
        'Indicative quote for swapping one Mantle token to another, from live mid-market prices. Read-only — does NOT route through a DEX or execute. Supported symbols: MNT, WMNT, USDC, USDT, METH, WETH, FBTC, CMETH, AUSD, USDE, SUSDE.',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', description: 'Token to sell, e.g. "USDC".' },
          toToken: { type: 'string', description: 'Token to buy, e.g. "MNT".' },
          amount: { type: 'string', description: 'Amount of fromToken, e.g. "100".' },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'swap_execute',
      description:
        "Prepare a REAL token swap on Mantle for the user to confirm in their wallet. Routed directly through Merchant Moe (Liquidity Book), the Mantle-native DEX, with slippage protection. Use this whenever the user wants to actually swap / trade / exchange tokens (not just a price quote). Supported: MNT, WMNT, USDC, USDT, METH, WETH, FBTC, CMETH, AUSD, USDE, SUSDE. The user's connected wallet signs; ERC-20 inputs may need a one-time approve first.",
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', description: 'Token to sell, e.g. "MNT".' },
          toToken: { type: 'string', description: 'Token to buy, e.g. "USDC".' },
          amount: { type: 'string', description: 'Amount of fromToken, e.g. "0.01".' },
          slippagePct: { type: 'number', description: 'Max slippage in percent (default 1).' },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aave_supply',
      description:
        "Prepare an Aave V3 supply (lend / deposit to earn yield) on Mantle for the user to confirm in their wallet. Use for 'lend', 'supply', 'deposit', 'earn on'. Suppliable: WMNT, USDC, USDT, WETH, METH (native MNT must be wrapped to WMNT first). May need a one-time approve.",
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Reserve symbol, e.g. "USDC".' },
          amount: { type: 'string', description: 'Amount in token units, e.g. "5".' },
        },
        required: ['token', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aave_withdraw',
      description:
        'Prepare an Aave V3 withdraw (pull supplied funds back) on Mantle for the user to confirm in their wallet. Use for "withdraw"/"redeem" from Aave. Pass amount "all" to withdraw everything.',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Reserve symbol, e.g. "USDC".' },
          amount: { type: 'string', description: 'Amount in token units, or "all".' },
        },
        required: ['token', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aave_borrow',
      description:
        'Prepare an Aave V3 borrow (variable rate) on Mantle for the user to confirm in their wallet. Requires existing collateral. Use for "borrow".',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Reserve symbol to borrow, e.g. "USDC".' },
          amount: { type: 'string', description: 'Amount in token units.' },
        },
        required: ['token', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aave_repay',
      description:
        'Prepare an Aave V3 repay (variable-rate debt) on Mantle for the user to confirm in their wallet. Use for "repay"/"pay back". Pass amount "all" to repay everything. May need a one-time approve.',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Reserve symbol, e.g. "USDC".' },
          amount: { type: 'string', description: 'Amount in token units, or "all".' },
        },
        required: ['token', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_identity',
      description:
        'Resolve an ERC-8004 agent identity on Mantle (owner, agent address, card) and its reputation (ratings + average score). By agentId.',
      parameters: {
        type: 'object',
        properties: { agentId: { type: 'string', description: 'The ERC-8004 agent id.' } },
        required: ['agentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_mnt',
      description:
        'Prepare a native MNT transfer for the user to confirm in their wallet. ALWAYS use this when the user wants to send / transfer / pay MNT to an address. It validates, enforces the policy cap, and simulates gas, then a "Confirm in wallet" button is shown and the user\'s own connected wallet signs and broadcasts. This is how transfers are executed — there is no separate simulate step.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: '0x recipient.' },
          amount: { type: 'string', description: 'Amount in MNT, e.g. "0.01".' },
        },
        required: ['to', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_token',
      description:
        "Prepare an ERC-20 token transfer for the user to confirm in their wallet. Use when the user wants to send/transfer a token (not native MNT). Supported: USDC, USDT, WMNT, METH, WETH. The user's connected wallet signs.",
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Token symbol, e.g. "USDC".' },
          to: { type: 'string', description: '0x recipient.' },
          amount: { type: 'string', description: 'Amount in token units, e.g. "5".' },
        },
        required: ['token', 'to', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wrap_mnt',
      description:
        "Prepare a wrap of native MNT into WMNT (ERC-20) for the user to confirm in their wallet. Calls WMNT.deposit() with the amount as value. Use when the user wants to wrap MNT.",
      parameters: {
        type: 'object',
        properties: { amount: { type: 'string', description: 'Amount of MNT to wrap, e.g. "0.1".' } },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unwrap_mnt',
      description:
        'Prepare an unwrap of WMNT back into native MNT for the user to confirm in their wallet. Calls WMNT.withdraw(amount). Use when the user wants to unwrap WMNT.',
      parameters: {
        type: 'object',
        properties: { amount: { type: 'string', description: 'Amount of WMNT to unwrap, e.g. "0.1".' } },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bridge_usdc',
      description:
        'Prepare a cross-chain bridge of USDC FROM Mantle to another chain via Stargate V2, for the user to confirm in their wallet. Destinations: ethereum, arbitrum, optimism, base, bnb, polygon. ERC-20 USDC needs a one-time approve first; the user pays a small native-MNT messaging fee (paid as the tx value). Use whenever the user wants to bridge/move USDC off Mantle.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'string', description: 'Amount of USDC to bridge, e.g. "100".' },
          toChain: {
            type: 'string',
            description: 'Destination chain: ethereum | arbitrum | optimism | base | bnb | polygon.',
          },
          toAddress: {
            type: 'string',
            description: 'Optional 0x recipient on the destination chain; defaults to the sender.',
          },
        },
        required: ['amount', 'toChain'],
      },
    },
  },
] as const

interface ToolContext {
  // The SIWE-connected wallet (null if signed out). Default subject for "my
  // balance / my portfolio / my positions" reads, and the signer for transfers
  // (the user's own wallet signs client-side).
  walletAddress: Address | null
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case 'get_balance': {
      const s = signer()
      const addr = ((args.address as string) || ctx.walletAddress || s?.account.address || '') as Address
      if (!isAddress(addr)) return { error: 'no address — the user is not connected; ask them to connect their wallet (top right).' }
      const [mnt, usdc] = await Promise.all([
        pub.getBalance({ address: addr }),
        pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [addr] }).catch(() => 0n),
      ])
      return { address: addr, MNT: formatEther(mnt), USDC: formatUnits(usdc as bigint, 6) }
    }
    case 'portfolio': {
      const s = signer()
      const addr = ((args.address as string) || ctx.walletAddress || s?.account.address || '') as Address
      if (!isAddress(addr)) return { error: 'no address — the user is not connected; ask them to connect their wallet (top right).' }
      const erc20s = TOKENS.filter(t => t.address !== 'native')
      const [native, ...erc20bals] = await Promise.all([
        pub.getBalance({ address: addr }),
        ...erc20s.map(t =>
          pub
            .readContract({ address: t.address as Address, abi: erc20Abi, functionName: 'balanceOf', args: [addr] })
            .then(v => v as bigint)
            .catch(() => 0n),
        ),
      ])
      const rawBySymbol: Record<string, bigint> = { MNT: native }
      erc20s.forEach((t, i) => {
        rawBySymbol[t.symbol] = erc20bals[i] ?? 0n
      })
      const prices = await fetchPrices(TOKENS.map(t => t.priceId))
      const holdings = TOKENS.map(t => {
        const amount = Number(formatUnits(rawBySymbol[t.symbol] ?? 0n, t.decimals))
        const usd = amount * (prices[t.priceId] ?? 0)
        return { symbol: t.symbol, amount, usd }
      })
        .filter(h => h.amount > 0)
        .sort((a, b) => b.usd - a.usd)
      const totalUsd = holdings.reduce((sum, h) => sum + h.usd, 0)
      return {
        address: addr,
        totalUsd: totalUsd.toFixed(2),
        holdings: holdings.map(h => ({ symbol: h.symbol, amount: h.amount.toPrecision(6), usd: h.usd.toFixed(2) })),
      }
    }
    case 'gas_price': {
      const gp = await pub.getGasPrice()
      const transferCost = (gp * 21000n)
      return { gwei: Number(gp) / 1e9, transferCostMnt: formatEther(transferCost) }
    }
    case 'defi_yields': {
      const limit = Math.min(10, Math.max(1, Number(args.limit ?? 5)))
      const res = await fetch('https://yields.llama.fi/pools')
      const json = (await res.json()) as { data?: { chain: string; project: string; symbol: string; apy: number; tvlUsd: number }[] }
      const pools = (json.data ?? [])
        .filter(p => p.chain === 'Mantle')
        .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
        .slice(0, limit)
        .map(p => ({ project: p.project, symbol: p.symbol, apy: `${(p.apy ?? 0).toFixed(2)}%`, tvlUsd: Math.round(p.tvlUsd) }))
      return { pools }
    }
    case 'swap_quote': {
      const from = String(args.fromToken).toUpperCase().trim()
      const to = String(args.toToken).toUpperCase().trim()
      const amount = Number(args.amount)
      if (!Number.isFinite(amount) || amount <= 0) return { error: 'invalid amount' }
      const idFrom = PRICE_IDS[from]
      const idTo = PRICE_IDS[to]
      if (!idFrom || !idTo) {
        return { error: `unsupported token. supported: ${Object.keys(PRICE_IDS).join(', ')}` }
      }
      const ids = Array.from(new Set([idFrom, idTo])).join(',')
      const res = await fetch(`https://coins.llama.fi/prices/current/${ids}`)
      const json = (await res.json()) as { coins?: Record<string, { price?: number }> }
      const priceFrom = json.coins?.[idFrom]?.price
      const priceTo = json.coins?.[idTo]?.price
      if (!priceFrom || !priceTo) return { error: 'price unavailable for one of the tokens right now' }
      const out = (amount * priceFrom) / priceTo
      return {
        from,
        to,
        amountIn: String(amount),
        indicativeAmountOut: out.toPrecision(8),
        priceUsd: { [from]: priceFrom, [to]: priceTo },
        executed: false,
        note: 'Indicative mid-market quote from live prices. Excludes DEX fees, slippage and routing — not a routed quote and not executed.',
      }
    }
    case 'swap_execute': {
      if (!ctx.walletAddress) {
        return { error: 'no connected wallet — ask the user to connect their wallet (top-right) to swap.' }
      }
      const fromSym = String(args.fromToken).toUpperCase().trim()
      const toSym = String(args.toToken).toUpperCase().trim()
      const fromTok = SWAP_TOKENS[fromSym]
      const toTok = SWAP_TOKENS[toSym]
      if (!fromTok || !toTok) {
        return { error: `unsupported token. supported: ${Object.keys(SWAP_TOKENS).join(', ')}` }
      }
      if (fromSym === toSym) return { error: 'tokenIn and tokenOut are the same' }
      const amount = String(args.amount)
      const num = Number(amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      const slippage = Math.min(50, Math.max(0.05, Number(args.slippagePct ?? 1)))
      const slippageBps = BigInt(Math.round(slippage * 100))
      const owner = ctx.walletAddress
      const isNativeIn = fromTok.address.toLowerCase() === NATIVE_SENTINEL
      const isNativeOut = toTok.address.toLowerCase() === NATIVE_SENTINEL
      // Native MNT travels through WMNT in the LB token path; the native-specific
      // router entrypoint wraps/unwraps. MNT↔WMNT itself is wrap/unwrap, not a swap.
      const routeIn = isNativeIn ? WMNT : (fromTok.address as Address)
      const routeOut = isNativeOut ? WMNT : (toTok.address as Address)
      if (routeIn.toLowerCase() === routeOut.toLowerCase()) {
        return { error: 'use wrap_mnt / unwrap_mnt for MNT↔WMNT, not swap' }
      }
      const amountIn = parseUnits(amount, fromTok.decimals)
      // Quote the best LB route — this is the exact route the swap executes.
      const quote = await quoteMoeLB([routeIn, routeOut], amountIn).catch(() => null)
      if (!quote) {
        return { error: `no Merchant Moe LB route with liquidity for ${fromSym}→${toSym}` }
      }
      const amountOutMin = (quote.amountOut * (10000n - slippageBps)) / 10000n
      const outDecimals = isNativeOut ? 18 : toTok.decimals

      // ERC-20 input must approve the LB router first (native input needs none).
      if (!isNativeIn) {
        const approve = await approveIfNeeded(routeIn, MOE_LB_ROUTER, amountIn, owner, `Approve ${amount} ${fromSym} for the swap`)
        if (approve) return approve
      }

      const path = {
        pairBinSteps: [...quote.binSteps],
        versions: [...quote.versions],
        tokenPath: [...quote.route],
      }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
      let data: `0x${string}`
      if (isNativeIn) {
        data = encodeFunctionData({ abi: LB_ROUTER_ABI, functionName: 'swapExactNATIVEForTokens', args: [amountOutMin, path, owner, deadline] })
      } else if (isNativeOut) {
        data = encodeFunctionData({ abi: LB_ROUTER_ABI, functionName: 'swapExactTokensForNATIVE', args: [amountIn, amountOutMin, path, owner, deadline] })
      } else {
        data = encodeFunctionData({ abi: LB_ROUTER_ABI, functionName: 'swapExactTokensForTokens', args: [amountIn, amountOutMin, path, owner, deadline] })
      }
      return {
        proposed: true,
        kind: 'swap',
        from: owner,
        to: MOE_LB_ROUTER,
        valueWei: isNativeIn ? amountIn.toString() : '0',
        data,
        amount,
        label: `Swap ${amount} ${fromSym} → ${toSym}`,
        expectedOut: `${formatUnits(quote.amountOut, outDecimals)} ${toSym}`,
        minOut: `${formatUnits(amountOutMin, outDecimals)} ${toSym}`,
        note: `Routed directly through Merchant Moe (Liquidity Book) at ${slippage}% max slippage — the route quoted is the route executed. A "Confirm in wallet" button is shown; the user's wallet signs and broadcasts. Never claim it is already swapped.`,
      }
    }
    case 'aave_supply':
    case 'aave_withdraw':
    case 'aave_borrow':
    case 'aave_repay': {
      if (!ctx.walletAddress) {
        return { error: 'no connected wallet — ask the user to connect their wallet (top-right).' }
      }
      const sym = String(args.token).toUpperCase().trim()
      const tok = AAVE_TOKENS[sym]
      if (!tok) {
        return { error: `unsupported reserve. Aave on Mantle supports: ${Object.keys(AAVE_TOKENS).join(', ')} (wrap native MNT to WMNT first).` }
      }
      const amountStr = String(args.amount).toLowerCase().trim()
      const isAll = amountStr === 'all' || amountStr === 'max'
      const owner = ctx.walletAddress
      if (!isAll) {
        const num = Number(amountStr)
        if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      }
      const units = isAll ? BigInt(MAX_UINT256) : parseUnits(amountStr, tok.decimals)

      if (name === 'aave_supply') {
        const approve = await approveIfNeeded(tok.address, AAVE_POOL, units, owner, `Approve ${args.amount} ${sym} for Aave`)
        if (approve) return approve
        return {
          proposed: true,
          kind: 'aave',
          from: owner,
          to: AAVE_POOL,
          valueWei: '0',
          data: encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'supply', args: [tok.address, units, owner, 0] }),
          amount: amountStr,
          label: `Supply ${args.amount} ${sym} to Aave`,
          note: 'Prepared. A "Confirm in wallet" button is shown — the user signs. Never claim it is already done.',
        }
      }
      if (name === 'aave_repay') {
        const approve = await approveIfNeeded(tok.address, AAVE_POOL, units, owner, `Approve ${args.amount} ${sym} to repay`)
        if (approve) return approve
        return {
          proposed: true,
          kind: 'aave',
          from: owner,
          to: AAVE_POOL,
          valueWei: '0',
          data: encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'repay', args: [tok.address, units, 2n, owner] }),
          amount: amountStr,
          label: `Repay ${isAll ? '' : `${args.amount} `}${sym} on Aave`,
          note: 'Prepared. Confirm in wallet to execute. Never claim it is already done.',
        }
      }
      if (name === 'aave_withdraw') {
        return {
          proposed: true,
          kind: 'aave',
          from: owner,
          to: AAVE_POOL,
          valueWei: '0',
          data: encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'withdraw', args: [tok.address, units, owner] }),
          amount: amountStr,
          label: `Withdraw ${isAll ? 'all ' : `${args.amount} `}${sym} from Aave`,
          note: 'Prepared. Confirm in wallet to execute. Never claim it is already done.',
        }
      }
      // aave_borrow
      return {
        proposed: true,
        kind: 'aave',
        from: owner,
        to: AAVE_POOL,
        valueWei: '0',
        data: encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'borrow', args: [tok.address, units, 2n, 0, owner] }),
        amount: amountStr,
        label: `Borrow ${args.amount} ${sym} from Aave`,
        note: 'Prepared (variable rate). Requires existing collateral or it will revert. Confirm in wallet to execute.',
      }
    }
    case 'agent_identity': {
      const id = BigInt(String(args.agentId))
      const [info, rep] = await Promise.all([
        resolveAgent(pub, 5000, id),
        getReputation(pub, 5000, id).catch(() => null),
      ])
      return {
        agentId: id.toString(),
        owner: info.owner,
        agentAddress: info.agentAddress,
        name: info.card?.name ?? null,
        description: info.card?.description ?? null,
        reputation: rep ? { ratings: rep.count.toString(), averageScore: rep.averageScore.toString() } : null,
      }
    }
    case 'bridge_usdc': {
      if (!ctx.walletAddress) {
        return { error: 'no connected wallet — ask the user to connect their wallet (top-right).' }
      }
      const owner = ctx.walletAddress
      const dstKey = String(args.toChain).toUpperCase().trim()
      const dstEid = BRIDGE_EIDS[dstKey]
      if (!dstEid) {
        return { error: `unsupported destination. Supported: ${Object.keys(BRIDGE_EIDS).join(', ')}` }
      }
      const num = Number(args.amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      const amountLD = parseUnits(String(args.amount), 6)
      const minAmountLD = (amountLD * 995n) / 1000n // 0.5% buffer for the Stargate fee
      const rcpt =
        args.toAddress && isAddress(String(args.toAddress)) ? (String(args.toAddress) as Address) : owner
      const toBytes32 = `0x${'0'.repeat(24)}${rcpt.slice(2).toLowerCase()}` as `0x${string}`
      const sendParam = {
        dstEid,
        to: toBytes32,
        amountLD,
        minAmountLD,
        extraOptions: '0x' as `0x${string}`,
        composeMsg: '0x' as `0x${string}`,
        oftCmd: '0x' as `0x${string}`, // empty = taxi (immediate) mode
      }
      // Approve USDC → Stargate pool first if needed.
      const approve = await approveIfNeeded(USDC, STARGATE_USDC_POOL, amountLD, owner, `Approve ${args.amount} USDC for the bridge`)
      if (approve) return approve
      // Quote the LayerZero messaging fee (paid as the tx value).
      let nativeFee: bigint
      try {
        const fee = (await pub.readContract({
          address: STARGATE_USDC_POOL,
          abi: STARGATE_ABI,
          functionName: 'quoteSend',
          args: [sendParam, false],
        })) as { nativeFee: bigint }
        nativeFee = fee.nativeFee
      } catch (e) {
        return { error: `bridge quote failed (Stargate quoteSend reverted): ${(e as Error).message?.slice(0, 140)}` }
      }
      const data = encodeFunctionData({
        abi: STARGATE_ABI,
        functionName: 'sendToken',
        args: [sendParam, { nativeFee, lzTokenFee: 0n }, owner],
      })
      return {
        proposed: true,
        kind: 'bridge',
        from: owner,
        to: STARGATE_USDC_POOL,
        valueWei: nativeFee.toString(),
        data,
        amount: String(args.amount),
        label: `Bridge ${args.amount} USDC: Mantle → ${dstKey}`,
        note: `Via Stargate V2. Messaging fee ≈ ${formatEther(nativeFee)} MNT (paid as the tx value). Min received ≈ ${formatUnits(minAmountLD, 6)} USDC on ${dstKey}. Confirm in wallet to execute — never claim it is already bridged.`,
      }
    }
    case 'send_mnt': {
      // The user's own connected wallet signs and broadcasts — the server never
      // holds a key, and no SIWE sign-in is required (the browser wallet signs).
      // We validate, enforce the policy cap, and simulate, then return a prepared
      // action the UI confirms in the wallet.
      const to = String(args.to) as Address
      if (!isAddress(to)) return { error: 'invalid recipient' }
      const amount = String(args.amount)
      const num = Number(amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      if (num > MAX_NATIVE_MNT) {
        return { error: `policy blocked: ${amount} MNT exceeds the ${MAX_NATIVE_MNT} MNT per-tx cap` }
      }
      const value = parseEther(amount)
      const gp = await pub.getGasPrice()
      return {
        proposed: true,
        kind: 'transfer',
        from: ctx.walletAddress ?? '',
        to,
        amount,
        valueWei: value.toString(),
        withinPolicyCap: true,
        policyCapMnt: MAX_NATIVE_MNT,
        estimatedGasMnt: formatEther(21000n * gp),
        note: 'Prepared and policy-checked. A "Confirm in wallet" button is shown — the user\'s connected wallet signs and broadcasts. Tell them to confirm in their wallet; never claim it is already sent.',
      }
    }
    case 'send_token': {
      const sym = String(args.token).toUpperCase().trim()
      const token = TOKENS.find(t => t.symbol === sym && t.address !== 'native')
      if (!token) {
        return { error: `unsupported token. supported: ${TOKENS.filter(t => t.address !== 'native').map(t => t.symbol).join(', ')}` }
      }
      const to = String(args.to) as Address
      if (!isAddress(to)) return { error: 'invalid recipient' }
      const num = Number(args.amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      const units = parseUnits(String(args.amount), token.decimals)
      const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, units] })
      return {
        proposed: true,
        kind: 'token-transfer',
        from: ctx.walletAddress ?? '',
        to: token.address,
        valueWei: '0',
        data,
        amount: String(args.amount),
        label: `Send ${args.amount} ${sym} to ${to.slice(0, 6)}…${to.slice(-4)}`,
        note: 'Prepared. A "Confirm in wallet" button is shown — the user signs the ERC-20 transfer. Never claim it is already sent.',
      }
    }
    case 'wrap_mnt': {
      const num = Number(args.amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      if (num > MAX_NATIVE_MNT) return { error: `policy blocked: ${args.amount} MNT exceeds the ${MAX_NATIVE_MNT} MNT per-tx cap` }
      const value = parseEther(String(args.amount))
      const data = encodeFunctionData({ abi: WETH9_ABI, functionName: 'deposit', args: [] })
      return {
        proposed: true,
        kind: 'wrap',
        from: ctx.walletAddress ?? '',
        to: WMNT,
        valueWei: value.toString(),
        data,
        amount: String(args.amount),
        label: `Wrap ${args.amount} MNT → WMNT`,
        note: 'Prepared. A "Confirm in wallet" button is shown — the user signs. Never claim it is already done.',
      }
    }
    case 'unwrap_mnt': {
      const num = Number(args.amount)
      if (!Number.isFinite(num) || num <= 0) return { error: 'invalid amount' }
      const units = parseEther(String(args.amount))
      const data = encodeFunctionData({ abi: WETH9_ABI, functionName: 'withdraw', args: [units] })
      return {
        proposed: true,
        kind: 'unwrap',
        from: ctx.walletAddress ?? '',
        to: WMNT,
        valueWei: '0',
        data,
        amount: String(args.amount),
        label: `Unwrap ${args.amount} WMNT → MNT`,
        note: 'Prepared. A "Confirm in wallet" button is shown — the user signs. Never claim it is already done.',
      }
    }
    default:
      return { error: `unknown tool ${name}` }
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
}

/** An on-chain action prepared server-side (validated, policy-capped) for the
 *  user's connected wallet to sign + broadcast client-side. `to`/`valueWei`/
 *  `data` are the raw tx fields; native transfers omit `data`. */
export interface PendingAction {
  kind: 'transfer' | 'token-transfer' | 'wrap' | 'unwrap' | 'swap' | 'approve' | 'aave' | 'bridge'
  from: string
  to: string
  amount: string
  valueWei: string
  data?: string
  label?: string
  estimatedGasMnt?: string
}

const PROPOSED_KINDS = new Set(['transfer', 'token-transfer', 'wrap', 'unwrap', 'swap', 'approve', 'aave', 'bridge'])

export interface AgentResult {
  reply: string
  trace: { tool: string; args: unknown; result: unknown }[]
  pendingAction?: PendingAction
}

const SYSTEM_PROMPT = `You are nebula, a Mantle-native, policy-aware AI treasury assistant.
You operate on Mantle (chain 5000). Use the tools to answer with live on-chain data — never invent numbers.
The defensible idea: the AI advises, deterministic code enforces the fund controls. Value-moving actions
are policy-capped before they can broadcast; say so when you use them.
Actions execute from the user's OWN connected wallet: the prepare tools (send_mnt for native MNT, send_token
for ERC-20 transfers, wrap_mnt and unwrap_mnt for MNT↔WMNT) validate + policy-check + return a prepared tx,
and the UI shows a "Confirm in wallet" button — the user's wallet signs and broadcasts. ALWAYS use the
matching prepare tool when the user asks to send/transfer/wrap/unwrap. Never claim it was already done; say
it's prepared and ask them to confirm in their wallet. If no wallet is connected, tell them to connect (top-right).
Swaps execute from the user's connected wallet via swap_execute (routed directly through Merchant Moe
Liquidity Book on Mantle, with slippage protection). Use swap_execute whenever the user wants
to swap/trade/exchange; use swap_quote ONLY for a price estimate with no execution. An ERC-20 input may need
a one-time approve first — if an approve action is returned, tell the user to confirm it, then run the swap
again to execute. Never claim a swap happened until the user has confirmed it in their wallet.
Lending executes on Aave V3 via aave_supply (lend/deposit/earn), aave_withdraw, aave_borrow, aave_repay —
all prepared for the connected wallet to confirm (supply/repay may need a one-time approve first; native MNT
must be wrapped to WMNT before supplying). Staking has no dedicated Mantle integration here — suggest Aave
supply (lend to earn) or wrapping, and don't invent a staking contract. Cross-chain bridging of USDC off
Mantle (to Ethereum, Arbitrum, Optimism, Base, BNB, Polygon) uses bridge_usdc (Stargate V2): it needs a
one-time approve and a small native-MNT messaging fee. Never claim an action happened until
the user confirms it in their wallet.
Be concise and concrete. When you cite a balance, yield, quote, or tx, it must come from a tool result.`

const OPENAI_URL = (process.env.NEBULA_LLM_BASE_URL ?? 'https://api.openai.com/v1') + '/chat/completions'
const MODEL = process.env.NEBULA_LLM_MODEL ?? 'gpt-4o-mini'

export interface RunAgentOptions {
  /** SIWE-authenticated wallet address for this request, if any. */
  authedAddress?: string | null
}

function extractPendingAction(trace: AgentResult['trace']): PendingAction | undefined {
  // Last prepared action wins (the one the user is being asked to confirm).
  for (let i = trace.length - 1; i >= 0; i--) {
    const r = trace[i].result as Record<string, unknown> | null
    if (
      r &&
      r.proposed === true &&
      typeof r.kind === 'string' &&
      PROPOSED_KINDS.has(r.kind) &&
      typeof r.valueWei === 'string'
    ) {
      return {
        kind: r.kind as PendingAction['kind'],
        from: String(r.from ?? ''),
        to: String(r.to ?? ''),
        amount: String(r.amount ?? ''),
        valueWei: String(r.valueWei),
        data: typeof r.data === 'string' ? r.data : undefined,
        label: typeof r.label === 'string' ? r.label : undefined,
        estimatedGasMnt: r.estimatedGasMnt ? String(r.estimatedGasMnt) : undefined,
      }
    }
  }
  return undefined
}

export async function runAgent(history: ChatMessage[], opts: RunAgentOptions = {}): Promise<AgentResult> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEBULA_LLM_API_KEY
  if (!apiKey) return { reply: 'The agent brain is not configured (no OPENAI_API_KEY on the server).', trace: [] }

  const walletAddress =
    opts.authedAddress && isAddress(opts.authedAddress) ? (opts.authedAddress as Address) : null
  const ctx: ToolContext = { walletAddress }

  const sys = walletAddress
    ? `${SYSTEM_PROMPT}\nThe user's connected wallet is ${walletAddress}. When they say "my", "me", "my treasury", "my balance/portfolio/positions", treat that as this address — call the tool with no address (it defaults to the connected wallet) and never ask them to paste an address.`
    : `${SYSTEM_PROMPT}\nThe user is not signed in, so there is no connected wallet. If they ask about "my" balance/portfolio, ask them to connect their wallet (top-right) — or answer for a specific address if they give one.`

  const messages: ChatMessage[] = [{ role: 'system', content: sys }, ...history]
  const trace: AgentResult['trace'] = []

  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.3 }),
    })
    if (!res.ok) return { reply: `brain error: ${res.status} ${(await res.text()).slice(0, 160)}`, trace }
    const data = (await res.json()) as {
      choices: { message: ChatMessage & { tool_calls?: ChatMessage['tool_calls'] } }[]
    }
    const msg = data.choices?.[0]?.message
    if (!msg) return { reply: 'no response from brain', trace }
    messages.push(msg)

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { reply: msg.content || '(no reply)', trace, pendingAction: extractPendingAction(trace) }
    }

    for (const call of msg.tool_calls) {
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(call.function.arguments || '{}')
      } catch {}
      let result: unknown
      try {
        result = await runTool(call.function.name, parsed, ctx)
      } catch (e) {
        result = { error: (e as Error).message }
      }
      trace.push({ tool: call.function.name, args: parsed, result })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
  return { reply: 'Stopped after several tool calls without a final answer — try rephrasing.', trace }
}
