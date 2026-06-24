/**
 * User-facing configuration shape for `nebula.config.ts`.
 *
 * Example:
 *
 *   import { defineConfig } from 'nebula-ai-core'
 *
 *   export default defineConfig({
 *     network: 'casper-mainnet',              // or 'casper-testnet'
 *     storage: { network: 'casper-mainnet' },
 *     brain: { model: 'gpt-4o-mini' },        // chosen at `nebula init`
 *     plugins: ['onchain', 'system'],
 *     tools: { 'defi.*': false, 'shell.run': false },
 *     imports: { claudeCode: true },
 *   })
 */

export type NebulaNetwork = 'casper-mainnet' | 'casper-testnet'

export type NebulaPlugin = 'onchain' | 'comms' | 'system' | 'telegram'

/**
 * Operator wallet source. On Casper the operator is the human (or org) that
 * owns the agent identity token; their key is an ed25519/secp256k1 PEM. The
 * keychain / keystore-file / raw-privkey sources all resolve to a
 * casper-js-sdk `PrivateKey`.
 */
export type OperatorSourceKind = 'keychain' | 'keystore-file' | 'raw-privkey'

/**
 * Persisted hint about which operator source to use when commands like
 * `nebula` (chat) and `nebula drain` need to talk to the operator wallet
 * again. Stores enough metadata to reconstruct the signer without re-prompting
 * the user from scratch (passphrases / QR scans still happen per-session).
 */
export interface OperatorSourceHint {
  source: OperatorSourceKind
  /** Only for `keychain`: the macOS Keychain service name to read. */
  keychainService?: string
  /** Only for `keystore-file`: absolute or `~`-prefixed path to the JSON keystore. */
  keystorePath?: string
}

export interface NebulaConfig {
  identity: {
    /** Operator public key (hex) that encrypts (and can recover) the agent keystore. */
    operator: string | null
    /** Agent account public key (hex) — a separate Casper key that signs + pays gas. */
    agent: string | null
  }
  network: NebulaNetwork
  storage: {
    network: NebulaNetwork
  }
  brain: {
    provider: string | null
    model: string | null
    /** Max assistant output tokens per turn. Default 4096. */
    maxOutputTokens?: number
    /**
     * Model context window. Used for auto-compaction trigger. Default
     * 1_000_000. Override for smaller models.
     */
    contextWindow?: number
    /**
     * Pre-flight summarize-fold of older history when the running estimate
     * breaches `threshold * contextWindow`. Set to `null` to disable.
     * Default: { threshold: 0.5, keepRecent: 8 }.
     */
    compaction?: {
      threshold?: number
      keepRecent?: number
    } | null
    /**
     * Persist channel histories to JSONL under
     * `~/.nebula/agents/<id>/conversations/`. Loaded on boot, appended per
     * turn, atomically rewritten on compaction. Default true.
     */
    persistConversations?: boolean
  }
  plugins: NebulaPlugin[]
  /** Glob-level tool allow/deny. Right-most match wins. */
  tools: Record<string, boolean>
  imports: {
    claudeCode: boolean
  }
  /**
   * Which operator source to use when reconnecting. Optional so legacy configs
   * still parse; commands fall back to the interactive picker when missing.
   */
  operator?: OperatorSourceHint | null
  /**
   * Permission system. `prompt` (default) prompts on dangerous commands;
   * `strict` always denies them; `off` is YOLO (no prompts). The `--yolo` CLI
   * flag and `/yolo` TUI slash both flip the active service to 'off' for the
   * current session without rewriting the file.
   */
  approvals?: {
    mode: 'strict' | 'prompt' | 'off'
    /** Always-approved patterns (regex against `kind|command|path` signature). */
    allowlist?: string[]
  }
  /**
   * Skills system. `disabled` is the persistent list of skill ids that should
   * never auto-load or appear in the index.
   */
  skills?: {
    disabled?: string[]
  }
  /**
   * Operator-supplied additions to the system prompt. `append` is concatenated
   * under a `# Operator instructions` header AFTER nebula's built-in safety +
   * tool-use scaffolding. Can NOT replace the base prompt; use it for personal
   * rules ("always reply in Indonesian", "prefer Bun over npm").
   */
  prompt?: {
    append?: string | null
  }
  /**
   * Multimodal vision routing. Vision limbs (vision.analyze, browser.vision)
   * call this OpenAI-compatible provider; the brain stays on `brain.provider`.
   * Set `null` to disable; tools then return a clear "not configured" error.
   */
  vision?: {
    provider?: string | null
  }
  /**
   * Structural sandbox for limb spawns. Defense-in-depth BENEATH the permission
   * floor — even when `s` (allow session) or yolo grants a destructive command,
   * the sandbox profile prevents writes outside an allowlist (agentDir +
   * workspaceRoot + /tmp/nebula-* + /var/folders).
   *
   *  - `none` (default): passthrough. Permission floor only.
   *  - `os`: native OS sandbox. macOS = sandbox-exec wrapper. Linux = bubblewrap.
   *  - `docker`: long-lived container per session, every spawn through `docker exec`.
   */
  sandbox?: {
    mode?: 'none' | 'os' | 'docker'
    /**
     * docker mode only: container image. Default `oven/bun:1`. Compatible with
     * Docker Desktop AND Podman. Override for custom tooling.
     */
    dockerImage?: string
    /**
     * docker mode only: bind-mount the host's workspaceRoot into the container
     * at /workspace. Default `false` for max isolation.
     */
    dockerMountWorkspace?: boolean
    /**
     * docker mode only: force a specific container runtime binary. Auto-detect
     * by default (tries docker, then podman).
     */
    dockerRuntimePath?: string
    /** docker mode only: CPU cores cap (`--cpus`). Default unlimited. */
    dockerCpu?: number
    /** docker mode only: memory cap in MB (`--memory <N>m`). Default unlimited. */
    dockerMemoryMb?: number
    /**
     * docker mode only: per-container writable-layer disk cap in MB. Linux +
     * overlay2 with pquota only — silently dropped on macOS / podman.
     */
    dockerDiskMb?: number
    /**
     * docker mode only: block all network access from inside the container
     * (`--network=none`). Default false.
     */
    dockerNoNetwork?: boolean
  }
}

export type NebulaConfigInput = Partial<NebulaConfig> & Pick<NebulaConfig, 'network'>

const DEFAULT_CONFIG: Omit<NebulaConfig, 'network' | 'storage'> = {
  identity: { operator: null, agent: null },
  brain: { provider: null, model: null },
  plugins: ['onchain', 'system'],
  tools: {},
  imports: { claudeCode: true },
  operator: null,
  approvals: { mode: 'prompt', allowlist: [] },
  skills: { disabled: [] },
  prompt: { append: null },
  vision: { provider: undefined },
  sandbox: { mode: 'none' },
}

export function defineConfig(input: NebulaConfigInput): NebulaConfig {
  return {
    ...DEFAULT_CONFIG,
    identity: input.identity ?? DEFAULT_CONFIG.identity,
    network: input.network,
    storage: input.storage ?? { network: input.network },
    brain: input.brain ?? DEFAULT_CONFIG.brain,
    plugins: input.plugins ?? DEFAULT_CONFIG.plugins,
    tools: input.tools ?? DEFAULT_CONFIG.tools,
    imports: input.imports ?? DEFAULT_CONFIG.imports,
    operator: input.operator ?? DEFAULT_CONFIG.operator,
    approvals: input.approvals ?? DEFAULT_CONFIG.approvals,
    skills: input.skills ?? DEFAULT_CONFIG.skills,
    prompt: input.prompt ?? DEFAULT_CONFIG.prompt,
    vision: input.vision ?? DEFAULT_CONFIG.vision,
    sandbox: input.sandbox ?? DEFAULT_CONFIG.sandbox,
  }
}

/** CSPR.cloud RPC proxy per network. */
export const NETWORK_RPC: Record<NebulaNetwork, string> = {
  'casper-mainnet': 'https://node.cspr.cloud/rpc',
  'casper-testnet': 'https://node.testnet.cspr.cloud/rpc',
}

/**
 * Casper chain-name used when signing deploys/transactions. Casper has NO
 * numeric chain id — the chain is identified by this string (`casper` /
 * `casper-test`).
 */
export const NETWORK_CHAIN_NAME: Record<NebulaNetwork, 'casper' | 'casper-test'> = {
  'casper-mainnet': 'casper',
  'casper-testnet': 'casper-test',
}

/** Resolve the network from a Casper chain-name string. */
export function networkFromChainName(name: string): NebulaNetwork | null {
  return (Object.entries(NETWORK_CHAIN_NAME).find(([, cn]) => cn === name)?.[0] ??
    null) as NebulaNetwork | null
}
