/**
 * `nebula reputation` + `nebula validation` — agent-trust registries (Odra).
 *
 *   nebula reputation show [<agentId>]
 *   nebula reputation give --agent <id> --score <0-100> [--tag t] [--uri u]
 *   nebula validation show <requestId>
 *   nebula validation request --agent <id> --data <str> [--uri u]
 *   nebula validation respond --id <reqId> --passed <true|false> [--score n] [--uri u]
 *
 * Reads return empty/placeholder data until the registries are deployed on
 * testnet (set NEBULA_REPUTATION_PACKAGE_HASH / NEBULA_VALIDATION_PACKAGE_HASH);
 * writes are stubbed with a clear "deploy the contracts first" message.
 */
import { cancel, intro, note, outro } from '@clack/prompts'
import { findAndLoadConfig } from '../config/load'
import {
  DEPLOY_FIRST_MESSAGE,
  agentIdByAddress,
  getReputation,
  getValidation,
  registriesConfigured,
} from '../util/casper-registries'

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

export interface TrustArgs {
  kind: 'reputation' | 'validation'
  sub: string
  argv: string[]
}

export function parseTrustArgs(
  kind: 'reputation' | 'validation',
  argv: string[],
): TrustArgs | { error: string } {
  const sub = argv[0] ?? ''
  const valid = kind === 'reputation' ? ['show', 'give'] : ['show', 'request', 'respond']
  if (!valid.includes(sub))
    return { error: `unknown subcommand '${sub || '(none)'}' — try: ${valid.join(' | ')}` }
  return { kind, sub, argv: argv.slice(1) }
}

export async function runTrust(args: TrustArgs): Promise<void> {
  const loaded = await findAndLoadConfig()
  if (!loaded) {
    console.error('No nebula.config.ts found. Run `nebula init` first.')
    process.exit(1)
  }
  const { config } = loaded

  // ── reads (graceful empty/placeholder until deployed) ──
  if (args.kind === 'reputation' && args.sub === 'show') {
    if (!registriesConfigured()) return void console.log(DEPLOY_FIRST_MESSAGE)
    let id = flag(args.argv, '--agent') ?? args.argv.find(a => !a.startsWith('--'))
    if (!id) {
      if (!config.identity.agent) return fail('Pass an <agentId>.')
      const resolved = await agentIdByAddress(config.identity.agent)
      if (resolved === 0n)
        return void console.log('this agent is not registered; run `nebula identity register`')
      id = resolved.toString()
    }
    const { count, averageScore } = await getReputation(BigInt(id))
    console.log(`agent id      ${id}`)
    console.log(`ratings       ${count}`)
    console.log(`avg score     ${averageScore} / 100`)
    return
  }
  if (args.kind === 'validation' && args.sub === 'show') {
    if (!registriesConfigured()) return void console.log(DEPLOY_FIRST_MESSAGE)
    const reqId = flag(args.argv, '--id') ?? args.argv.find(a => !a.startsWith('--'))
    if (!reqId) return fail('Pass a <requestId>.')
    const v = await getValidation(BigInt(reqId))
    if (!v) {
      console.log(`request id    ${reqId}`)
      console.log('status        not found')
      return
    }
    console.log(`request id    ${reqId}`)
    console.log(`agent id      ${v.agentId.toString()}`)
    console.log(`requester     ${v.requester}`)
    console.log(`status        ${v.responded ? (v.passed ? 'PASSED' : 'FAILED') : 'pending'}`)
    if (v.responded) {
      console.log(`validator     ${v.validator}`)
      console.log(`score         ${v.score} / 100`)
    }
    return
  }

  // ── writes — stubbed until the Odra registries are deployed ──
  intro(`nebula ${args.kind} ${args.sub}`)
  if (args.kind === 'reputation' && args.sub === 'give') {
    if (!flag(args.argv, '--agent')) return cancel('--agent <id> required')
    if (!flag(args.argv, '--score')) return cancel('--score <0-100> required')
  } else if (args.kind === 'validation' && args.sub === 'request') {
    if (!flag(args.argv, '--agent')) return cancel('--agent <id> required')
    if (!flag(args.argv, '--data')) return cancel('--data <string|hash> required')
  } else if (args.kind === 'validation' && args.sub === 'respond') {
    if (!flag(args.argv, '--id')) return cancel('--id <requestId> required')
  }
  note(DEPLOY_FIRST_MESSAGE, 'not deployed yet')
  outro(
    `Once the ${args.kind} registry is live, this will record the ${args.sub} on-chain and emit a CES event.`,
  )
}

function fail(msg: string): void {
  console.error(msg)
  process.exit(1)
}
