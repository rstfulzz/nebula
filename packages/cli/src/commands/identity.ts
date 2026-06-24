/**
 * `nebula identity` — on-chain agent identity backed by the Odra registries.
 *
 *   nebula identity card                 build + print the agent card (offline)
 *   nebula identity register [--name N]  register the agent on the Identity Registry
 *   nebula identity show [<agentId>]     resolve an agent (by id, or this agent's key)
 *
 * The owner of the identity token (CEP-78) is the operator wallet; the card's
 * `agentAddress` is the agent's public key hex. The identity registry package
 * resolves from NEBULA_IDENTITY_PACKAGE_HASH. Until the contracts are deployed
 * the reads return empty/placeholder data and `register` prints a clear
 * "deploy the contracts first" message.
 */
import { writeFile } from 'node:fs/promises'
import { cancel, intro, note, outro } from '@clack/prompts'
import { findAndLoadConfig } from '../config/load'
import {
  DEPLOY_FIRST_MESSAGE,
  agentIdByAddress,
  buildAgentCard,
  registriesConfigured,
  resolveAgentById,
} from '../util/casper-registries'

export interface IdentityArgs {
  sub: 'card' | 'register' | 'show'
  agentId?: string
  name?: string
  url?: string
  out?: string
}

export function parseIdentityArgs(argv: string[]): IdentityArgs | { error: string } {
  const sub = argv[0]
  if (sub !== 'card' && sub !== 'register' && sub !== 'show') {
    return { error: `unknown subcommand '${sub ?? '(none)'}' — try: card | register | show` }
  }
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const positional = argv.slice(1).find(a => !a.startsWith('--'))
  return {
    sub,
    agentId: sub === 'show' ? positional : undefined,
    name: flag('--name'),
    url: flag('--url'),
    out: flag('--out'),
  }
}

export async function runIdentity(args: IdentityArgs): Promise<void> {
  const loaded = await findAndLoadConfig()
  if (!loaded) {
    console.error('No nebula.config.ts found. Run `nebula init` first.')
    process.exit(1)
  }
  const { config } = loaded
  const agentAddress = config.identity.agent

  if (args.sub === 'card') {
    if (!agentAddress) {
      console.error('Config has no agent key. Run `nebula init` first.')
      process.exit(1)
    }
    const card = buildAgentCard({
      name: args.name ?? `nebula-${agentAddress.replace(/^0x/, '').slice(0, 6)}`,
      agentAddress,
      url: args.url,
    })
    const json = JSON.stringify(card, null, 2)
    if (args.out) {
      await writeFile(args.out, json, 'utf8')
      console.log(`agent card written to ${args.out}`)
    } else {
      console.log(json)
    }
    return
  }

  if (args.sub === 'show') {
    if (!registriesConfigured()) {
      console.log(DEPLOY_FIRST_MESSAGE)
      return
    }
    let id: bigint
    if (args.agentId) {
      id = BigInt(args.agentId)
    } else {
      if (!agentAddress) {
        console.error(
          'Pass an <agentId>, or run `nebula init` so this agent has a key to reverse-resolve.',
        )
        process.exit(1)
      }
      id = await agentIdByAddress(agentAddress)
      if (id === 0n) {
        console.log(
          `agent ${agentAddress} is not registered. Run \`nebula identity register\`.`,
        )
        return
      }
    }
    const resolved = await resolveAgentById(id)
    console.log(`agent id      ${resolved.agentId.toString()}`)
    console.log(`owner         ${resolved.owner}`)
    console.log(`agent key     ${resolved.agentAddress}`)
    console.log(
      `card          ${resolved.cardURI.slice(0, 80)}${resolved.cardURI.length > 80 ? '…' : ''}`,
    )
    return
  }

  // register — stubbed until the Odra registries are deployed.
  intro('nebula identity register')
  if (!agentAddress) {
    cancel('Config has no agent key. Run `nebula init` first.')
    return
  }
  note(DEPLOY_FIRST_MESSAGE, 'not deployed yet')
  outro(
    'Once the identity registry is live and NEBULA_IDENTITY_PACKAGE_HASH is set, ' +
      'this will register the agent (CEP-78) and emit a CES event.',
  )
}
