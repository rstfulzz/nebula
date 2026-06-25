import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PublicKey } from 'casper-js-sdk'
/**
 * Casper agent tools. Each is a plain {name, description, schema, handler} object
 * (structurally a nebula-ai-core ToolDef). Value-moving tools run through
 * policy -> execute -> verify-on-chain.
 */
import { z } from 'zod'
import { getBalanceMotes, getValidators, waitForExecution } from './client'
import { csprToMotes, motesToCspr } from './config'
import type { CasperOnchainContext } from './context'
import { evaluatePolicy } from './policy'
import { MIN_DELEGATION_CSPR, buildUnsignedDelegate, delegate, undelegate } from './stake'
import { buildUnsignedTokenTransfer, tokenBalanceRaw, transferToken } from './token'
import { buildUnsignedTransfer, transferCspr } from './transfer'
import { treasuryDeposit, treasuryExecute, treasuryRegister, treasuryWithdraw } from './treasury'
import { loadOrCreateTreasuryAgent } from './treasury-agent'

export interface CasperTool<A = any> {
  name: string
  description: string
  searchHint?: string
  schema: z.ZodType<A>
  handler: (args: A) => Promise<{
    ok: boolean
    data?: unknown
    error?: string
    requiresApproval?: boolean
  }>
}

const ok = (data: unknown) => ({ ok: true as const, data })
const fail = (error: string, extra: Record<string, unknown> = {}) => ({
  ok: false as const,
  error,
  ...extra,
})

export function makeStatus(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.status',
    description: 'Casper node + network status (chain name, api version) for the active network.',
    searchHint: 'status network node chain casper',
    schema: z.object({}),
    handler: async () => {
      try {
        const s: any = await (ctx.rpc as any).getStatus()
        return ok({
          network: ctx.network.network,
          chainName: ctx.network.chainName,
          rpc: ctx.network.nodeRpc,
          apiVersion: s?.apiVersion ?? s?.api_version,
          chainspec: s?.chainspecName ?? s?.chainspec_name,
        })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeBalance(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.balance',
    description: 'Native CSPR main-purse balance for a public key (defaults to the agent).',
    searchHint: 'balance cspr funds account',
    schema: z.object({
      publicKey: z.string().optional().describe('Hex public key; omit for the agent.'),
    }),
    handler: async (a: any) => {
      try {
        const pub = a.publicKey ? PublicKey.fromHex(a.publicKey) : ctx.pub
        if (!pub) return fail('no public key (set CASPER_SECRET_KEY_PATH or pass publicKey)')
        const motes = await getBalanceMotes(ctx.rpc, pub)
        return ok({ publicKey: pub.toHex(), motes: motes.toString(), cspr: motesToCspr(motes) })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeSend(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.send',
    description:
      'Transfer native CSPR to a recipient public key (min 2.5 CSPR). Policy-gated, then on-chain execution is verified before reporting success.',
    searchHint: 'send transfer pay cspr native',
    schema: z.object({
      to: z.string().min(1).describe('Recipient hex public key.'),
      amount: z.union([z.number(), z.string()]).describe('Amount in CSPR (>= 2.5).'),
      approved: z.boolean().optional().describe('Set true to satisfy an approval-required policy.'),
    }),
    handler: async (a: any) => {
      try {
        const amountMotes = csprToMotes(a.amount)
        if (ctx.policy) {
          const v = evaluatePolicy(
            { kind: 'transfer', asset: 'native', amountMotes, to: a.to },
            ctx.policy,
          )
          if (!v.allowed) return fail(`policy blocked: ${v.violations.join('; ')}`)
          if (v.requiresApproval && !a.approved)
            return fail('requires approval (re-call with approved:true)', {
              requiresApproval: true,
            })
        }
        let hash: string
        let explorer: string
        if (ctx.signer) {
          // Local PEM path: sign + submit ourselves.
          ;({ hash, explorer } = await transferCspr(ctx.rpc, ctx.signer, {
            to: a.to,
            amountCspr: a.amount,
          }))
        } else if (ctx.webSign && ctx.pub) {
          // Keyless web path: hand the connected wallet an UNSIGNED tx; it signs
          // *and* submits in the browser and returns the resulting hash.
          const json = buildUnsignedTransfer(ctx.pub, { to: a.to, amountCspr: a.amount })
          ;({ hash } = await ctx.webSign(json, ctx.pub.toHex()))
          explorer = `${ctx.network.explorer}/transaction/${hash}`
        } else {
          return fail(
            'no signer or connected wallet (set CASPER_SECRET_KEY_PATH or run `nebula connect`)',
          )
        }
        const status = await waitForExecution(ctx.rpc, hash)
        if (!status.success)
          return fail(`tx failed: ${status.errorMessage ?? 'unknown'}`, {
            data: { hash, explorer },
          })
        return ok({
          hash,
          explorer,
          recipient: a.to,
          amountCspr: Number(a.amount),
          costMotes: status.costMotes,
          policyEnforced: ctx.policy != null,
        })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeValidators(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.validators',
    description: 'List current Casper validators (for staking / earn).',
    searchHint: 'validators stake earn delegate auction',
    schema: z.object({ limit: z.number().optional() }),
    handler: async (a: any) => {
      try {
        return ok({ validators: await getValidators(ctx.rpc, a.limit ?? 10) })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeStake(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.stake',
    description: `Delegate CSPR to a validator to earn staking rewards (min ${MIN_DELEGATION_CSPR} CSPR). Policy-gated + verified.`,
    searchHint: 'stake delegate earn yield rewards',
    schema: z.object({
      validator: z.string().min(1).describe('Validator hex public key.'),
      amount: z
        .union([z.number(), z.string()])
        .describe(`CSPR to delegate (>= ${MIN_DELEGATION_CSPR}).`),
      approved: z.boolean().optional(),
    }),
    handler: async (a: any) => {
      try {
        if (Number(a.amount) < MIN_DELEGATION_CSPR)
          return fail(`minimum delegation is ${MIN_DELEGATION_CSPR} CSPR`)
        const amountMotes = csprToMotes(a.amount)
        if (ctx.policy) {
          const v = evaluatePolicy({ kind: 'stake', asset: 'native', amountMotes }, ctx.policy)
          if (!v.allowed) return fail(`policy blocked: ${v.violations.join('; ')}`)
          if (v.requiresApproval && !a.approved)
            return fail('requires approval (re-call with approved:true)', {
              requiresApproval: true,
            })
        }
        let hash: string
        if (ctx.signer) {
          // Local PEM path: sign + submit ourselves.
          hash = await delegate(ctx.rpc, ctx.signer, a.validator, a.amount)
        } else if (ctx.webSign && ctx.pub) {
          // Keyless web path: hand the connected wallet an UNSIGNED tx; it signs
          // *and* submits in the browser and returns the resulting hash.
          const json = buildUnsignedDelegate(ctx.pub, a.validator, a.amount)
          ;({ hash } = await ctx.webSign(json, ctx.pub.toHex()))
        } else {
          return fail(
            'no signer or connected wallet (set CASPER_SECRET_KEY_PATH or run `nebula connect`)',
          )
        }
        const status = await waitForExecution(ctx.rpc, hash)
        if (!status.success)
          return fail(`stake failed: ${status.errorMessage ?? 'unknown'}`, { data: { hash } })
        return ok({
          hash,
          explorer: `${ctx.network.explorer}/transaction/${hash}`,
          validator: a.validator,
          amountCspr: Number(a.amount),
        })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeUnstake(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.unstake',
    description: 'Undelegate (unstake) CSPR from a validator. Policy-gated + verified.',
    searchHint: 'unstake undelegate withdraw stake',
    schema: z.object({
      validator: z.string().min(1),
      amount: z.union([z.number(), z.string()]),
      approved: z.boolean().optional(),
    }),
    handler: async (a: any) => {
      try {
        if (!ctx.signer) return fail('no signer (set CASPER_SECRET_KEY_PATH)')
        const hash = await undelegate(ctx.rpc, ctx.signer, a.validator, a.amount)
        const status = await waitForExecution(ctx.rpc, hash)
        if (!status.success)
          return fail(`unstake failed: ${status.errorMessage ?? 'unknown'}`, { data: { hash } })
        return ok({
          hash,
          explorer: `${ctx.network.explorer}/transaction/${hash}`,
          validator: a.validator,
          amountCspr: Number(a.amount),
        })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makePolicyShow(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.policy',
    description: 'Show the active deterministic fund-control policy (read-only).',
    searchHint: 'policy guardrail caps limits autonomy',
    schema: z.object({}),
    handler: async () =>
      ok({
        enforced: ctx.policy != null,
        policy: ctx.policy
          ? {
              readOnly: ctx.policy.readOnly ?? false,
              autonomy: ctx.policy.autonomy,
              maxNativeCspr: ctx.policy.maxNativeMotesPerTx
                ? motesToCspr(ctx.policy.maxNativeMotesPerTx)
                : undefined,
              autoMaxNativeCspr: ctx.policy.autoMaxNativeMotesPerTx
                ? motesToCspr(ctx.policy.autoMaxNativeMotesPerTx)
                : undefined,
              recipientAllowlist: ctx.policy.recipientAllowlist,
              tokenAllowlist: ctx.policy.tokenAllowlist,
            }
          : null,
      }),
  }
}

const TOKEN_DECIMALS = 9
const TOKEN_SYMBOL = 'NBL'

export function makeTokenSend(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.token-send',
    description: `Transfer CEP-18 tokens (${TOKEN_SYMBOL}, the configured test token, ${TOKEN_DECIMALS} decimals) to a recipient public key. Verified on-chain.`,
    searchHint: 'token cep18 transfer send nbl stablecoin csprusd',
    schema: z.object({
      to: z.string().min(1).describe('Recipient hex public key.'),
      amount: z.union([z.number(), z.string()]).describe(`Amount in ${TOKEN_SYMBOL}.`),
    }),
    handler: async (a: any) => {
      try {
        const pkg = process.env.NEBULA_TOKEN_PACKAGE_HASH
        if (!pkg) return fail('no token configured (set NEBULA_TOKEN_PACKAGE_HASH)')
        const raw = BigInt(Math.round(Number(a.amount) * 10 ** TOKEN_DECIMALS))
        let hash: string
        let explorer: string
        if (ctx.signer) {
          // Local PEM path: sign + submit ourselves.
          ;({ hash, explorer } = await transferToken(ctx.rpc, ctx.signer, {
            tokenPackageHash: pkg,
            to: a.to,
            amount: raw,
          }))
        } else if (ctx.webSign && ctx.pub) {
          // Keyless web path: hand the connected wallet an UNSIGNED tx; it signs
          // *and* submits in the browser and returns the resulting hash.
          const json = buildUnsignedTokenTransfer(ctx.pub, {
            tokenPackageHash: pkg,
            to: a.to,
            amount: raw,
          })
          ;({ hash } = await ctx.webSign(json, ctx.pub.toHex()))
          explorer = `${ctx.network.explorer}/transaction/${hash}`
        } else {
          return fail(
            'no signer or connected wallet (set CASPER_SECRET_KEY_PATH or run `nebula connect`)',
          )
        }
        const status = await waitForExecution(ctx.rpc, hash)
        if (!status.success)
          return fail(`tx failed: ${status.errorMessage ?? 'unknown'}`, {
            data: { hash, explorer },
          })
        return ok({
          hash,
          explorer,
          recipient: a.to,
          amount: Number(a.amount),
          token: TOKEN_SYMBOL,
        })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeTokenBalance(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.token-balance',
    description: `Read the agent's CEP-18 ${TOKEN_SYMBOL} token balance.`,
    searchHint: 'token balance cep18 nbl csprusd holdings',
    schema: z.object({}),
    handler: async () => {
      try {
        const contract = process.env.NEBULA_TOKEN_CONTRACT_HASH
        if (!contract) return fail('no token contract configured (set NEBULA_TOKEN_CONTRACT_HASH)')
        if (!ctx.pub) return fail('no signer (set CASPER_SECRET_KEY_PATH)')
        const raw = await tokenBalanceRaw(ctx.rpc, contract, ctx.pub.toHex())
        return ok({
          token: TOKEN_SYMBOL,
          balance: Number(raw) / 10 ** TOKEN_DECIMALS,
          raw: raw.toString(),
        })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

// ─── Treasury: the delegated "one user, one wallet, one agent" budget ─────────
// The owner sets up an on-chain bounded budget (per-tx + daily caps) and
// registers a separate agent key; the agent then spends from that budget with
// the contract enforcing every cap on-chain. No off-chain policy gate is needed
// here — the Treasury contract is the enforcement boundary.

/** Gas the agent key needs in its own purse to pay for `execute` (~15 CSPR/call). */
const TREASURY_AGENT_GAS_CSPR = 20

/** Resolve the cargo-purse deposit session wasm: env override, else repo default. */
function depositWasmPath(): string {
  const override = process.env.NEBULA_TREASURY_DEPOSIT_WASM
  if (override) return override
  // <repo>/contracts-session/deposit_session.wasm — this module lives at
  // <repo>/packages/plugin-onchain/src/tools.ts, so the repo root is ../../..
  const here = fileURLToPath(import.meta.url)
  return resolve(here, '../../../..', 'contracts-session/deposit_session.wasm')
}

export function makeTreasurySetup(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.treasury-setup',
    description:
      'Set up the delegated treasury: fund a separate agent key for gas, register it against an on-chain bounded budget (per-tx + daily caps, enforced by the contract), and deposit CSPR into the budget. The owner (your wallet) signs.',
    searchHint: 'treasury setup budget delegate agent register deposit cap bounded',
    schema: z.object({
      depositCspr: z.union([z.number(), z.string()]).describe('CSPR to deposit into the budget.'),
      perTxCapCspr: z
        .union([z.number(), z.string()])
        .describe('Per-transaction spend cap, in CSPR.'),
      dailyCapCspr: z.union([z.number(), z.string()]).describe('Rolling 24h spend cap, in CSPR.'),
    }),
    handler: async (a: any) => {
      try {
        const treasuryPkg = process.env.NEBULA_TREASURY_PACKAGE_HASH
        if (!treasuryPkg) return fail('no treasury configured (set NEBULA_TREASURY_PACKAGE_HASH)')
        if (!ctx.signer || !ctx.pub)
          return fail('treasury setup needs the owner key (set CASPER_SECRET_KEY_PATH)')

        const agent = await loadOrCreateTreasuryAgent()

        // (a) Fund the agent key so it can pay its own execute-gas later.
        const fund = await transferCspr(ctx.rpc, ctx.signer, {
          to: agent.publicKeyHex,
          amountCspr: TREASURY_AGENT_GAS_CSPR,
        })
        const fundStatus = await waitForExecution(ctx.rpc, fund.hash)
        if (!fundStatus.success)
          return fail(`agent gas funding failed: ${fundStatus.errorMessage ?? 'unknown'}`, {
            data: { hash: fund.hash, explorer: fund.explorer },
          })

        // (b) Register the agent key + caps against the owner's budget.
        const reg = await treasuryRegister(ctx.rpc, ctx.signer, {
          treasuryPkg,
          agentPublicKeyHex: agent.publicKeyHex,
          perTxCapMotes: csprToMotes(a.perTxCapCspr),
          dailyCapMotes: csprToMotes(a.dailyCapCspr),
        })
        const regStatus = await waitForExecution(ctx.rpc, reg.hash)
        if (!regStatus.success)
          return fail(`register failed: ${regStatus.errorMessage ?? 'unknown'}`, {
            data: { hash: reg.hash, explorer: reg.explorer },
          })

        // (c) Deposit CSPR into the budget via the cargo-purse session.
        const dep = await treasuryDeposit(ctx.rpc, ctx.signer, {
          treasuryPkg,
          amountMotes: csprToMotes(a.depositCspr),
          wasmPath: depositWasmPath(),
        })
        const depStatus = await waitForExecution(ctx.rpc, dep.hash)
        if (!depStatus.success)
          return fail(`deposit failed: ${depStatus.errorMessage ?? 'unknown'}`, {
            data: { hash: dep.hash, explorer: dep.explorer },
          })

        return ok({
          agentPublicKey: agent.publicKeyHex,
          agentGasCspr: TREASURY_AGENT_GAS_CSPR,
          depositedCspr: Number(a.depositCspr),
          perTxCapCspr: Number(a.perTxCapCspr),
          dailyCapCspr: Number(a.dailyCapCspr),
          register: { hash: reg.hash, explorer: reg.explorer },
          deposit: { hash: dep.hash, explorer: dep.explorer },
          fundAgent: { hash: fund.hash, explorer: fund.explorer },
        })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeTreasurySend(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.treasury-send',
    description:
      'Spend CSPR from the on-chain bounded treasury budget. The delegated agent key signs; the contract reverts if the amount is over the per-tx/daily cap, the budget is too low, or the treasury is paused.',
    searchHint: 'treasury send spend pay budget delegated agent execute',
    schema: z.object({
      to: z.string().min(1).describe('Recipient hex public key.'),
      amountCspr: z.union([z.number(), z.string()]).describe('Amount in CSPR to spend.'),
    }),
    handler: async (a: any) => {
      try {
        const treasuryPkg = process.env.NEBULA_TREASURY_PACKAGE_HASH
        if (!treasuryPkg) return fail('no treasury configured (set NEBULA_TREASURY_PACKAGE_HASH)')
        if (!ctx.pub)
          return fail('treasury send needs the owner public key (set CASPER_SECRET_KEY_PATH)')

        const agent = await loadOrCreateTreasuryAgent()
        const { hash, explorer } = await treasuryExecute(ctx.rpc, agent.signer, {
          treasuryPkg,
          ownerPublicKeyHex: ctx.pub.toHex(),
          recipientPublicKeyHex: a.to,
          amountMotes: csprToMotes(a.amountCspr),
        })
        const status = await waitForExecution(ctx.rpc, hash)
        if (!status.success)
          return fail(`treasury send failed: ${status.errorMessage ?? 'unknown'}`, {
            data: { hash, explorer },
          })
        return ok({
          hash,
          explorer,
          recipient: a.to,
          amountCspr: Number(a.amountCspr),
          paidFrom: 'on-chain bounded treasury budget (caps enforced by contract)',
          agentPublicKey: agent.publicKeyHex,
        })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}

export function makeTreasuryWithdraw(ctx: CasperOnchainContext): CasperTool {
  return {
    name: 'casper.treasury-withdraw',
    description: 'Withdraw CSPR from the treasury budget back to the owner. The owner signs.',
    searchHint: 'treasury withdraw reclaim budget owner pull',
    schema: z.object({
      amountCspr: z.union([z.number(), z.string()]).describe('Amount in CSPR to withdraw.'),
    }),
    handler: async (a: any) => {
      try {
        const treasuryPkg = process.env.NEBULA_TREASURY_PACKAGE_HASH
        if (!treasuryPkg) return fail('no treasury configured (set NEBULA_TREASURY_PACKAGE_HASH)')
        if (!ctx.signer)
          return fail('treasury withdraw needs the owner key (set CASPER_SECRET_KEY_PATH)')

        const { hash, explorer } = await treasuryWithdraw(ctx.rpc, ctx.signer, {
          treasuryPkg,
          amountMotes: csprToMotes(a.amountCspr),
        })
        const status = await waitForExecution(ctx.rpc, hash)
        if (!status.success)
          return fail(`treasury withdraw failed: ${status.errorMessage ?? 'unknown'}`, {
            data: { hash, explorer },
          })
        return ok({ hash, explorer, amountCspr: Number(a.amountCspr) })
      } catch (e) {
        return fail((e as Error).message.slice(0, 200))
      }
    },
  }
}
