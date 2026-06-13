import { homedir } from 'node:os'
import { join } from 'node:path'

/** Resolve `~/.nebula` at call time so tests can override via NEBULA_ROOT or HOME. */
function nebulaRoot(): string {
  return process.env.NEBULA_ROOT ?? join(homedir(), '.nebula')
}

export interface AgentPaths {
  readonly root: string
  readonly config: string
  readonly skills: string
  readonly plugins: string
  readonly agentsDir: string
  agent(id: string): {
    dir: string
    keystore: string
    cache: string
    memoryDir: string
    memoryIndex: string
    agentMemoryDir: string
    userMemoryDir: string
    publicDir: string
    activityLog: string
    runtimeState: string
    inboxDir: string
    pairingDir: string
  }
}

export const agentPaths: AgentPaths = {
  get root() {
    return nebulaRoot()
  },
  get config() {
    return join(nebulaRoot(), 'config.ts')
  },
  get skills() {
    return join(nebulaRoot(), 'skills')
  },
  get plugins() {
    return join(nebulaRoot(), 'plugins')
  },
  get agentsDir() {
    return join(nebulaRoot(), 'agents')
  },
  agent(id: string) {
    const dir = join(nebulaRoot(), 'agents', id)
    return {
      dir,
      keystore: join(dir, 'keystore.json'),
      cache: join(dir, 'cache'),
      memoryDir: join(dir, 'memory'),
      memoryIndex: join(dir, 'memory', 'MEMORY.md'),
      agentMemoryDir: join(dir, 'memory', 'agent'),
      userMemoryDir: join(dir, 'memory', 'user'),
      publicDir: join(dir, 'memory', 'public'),
      activityLog: join(dir, 'activity.jsonl'),
      runtimeState: join(dir, 'runtime', 'state.json'),
      inboxDir: join(dir, 'inbox'),
      pairingDir: join(dir, 'pairing'),
    }
  },
}

/** Compute the deterministic agent id from a wallet address. Stable pre-iNFT. */
export function placeholderAgentId(walletAddress: string): string {
  const clean = walletAddress.toLowerCase().replace(/^0x/, '')
  return clean.slice(0, 16)
}
