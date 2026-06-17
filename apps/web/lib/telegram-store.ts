// Persistent store for the Telegram bridge: pending pairings + active delegated
// sessions (telegramId ↔ agent). The agent key is held SEALED (vault); the rest
// (telegramId ↔ agentAddress, TTL, policy cap) is operational metadata.
//
// Storage is an atomic JSON file under NEBULA_DATA_DIR (untracked → survives the
// deploy's `git reset --hard`). Fine for a single always-on Node host; for
// horizontal scale, swap the load()/save() pair for Postgres/Redis — the exported
// functions are the only surface callers depend on.
import 'server-only'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.NEBULA_DATA_DIR ?? join(process.cwd(), '.data')
const FILE = join(DIR, 'telegram-links.json')

/** A live delegated session: this Telegram user's agent acts server-side. */
export interface TgLink {
  telegramId: number
  agentAddress: string
  /** Sealed (vault) agent private key. */
  sealedKey: string
  createdAt: number
  /** Session expiry (ms epoch). After this the agent stops acting until re-paired. */
  expiresAt: number
  /** Per-tx native-MNT cap for this delegated session (defense in depth). */
  policyMaxMnt: number
}

/** A short-lived pairing code, claimed by the web link page. */
interface TgPending {
  telegramId: number
  expiresAt: number
}

interface DB {
  links: Record<string, TgLink>
  pending: Record<string, TgPending>
}

function load(): DB {
  try {
    if (!existsSync(FILE)) return { links: {}, pending: {} }
    const db = JSON.parse(readFileSync(FILE, 'utf8')) as DB
    return { links: db.links ?? {}, pending: db.pending ?? {} }
  } catch {
    return { links: {}, pending: {} }
  }
}

function save(db: DB): void {
  mkdirSync(DIR, { recursive: true })
  const tmp = `${FILE}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 })
  renameSync(tmp, FILE) // atomic swap
}

const now = () => Date.now()
const PAIR_TTL_MS = 10 * 60 * 1000 // 10 min to claim a pairing code

/** Drop expired pending codes + expired sessions. Called on every mutation. */
function prune(db: DB): void {
  const t = now()
  for (const [k, v] of Object.entries(db.pending)) if (v.expiresAt < t) delete db.pending[k]
  for (const [k, v] of Object.entries(db.links)) if (v.expiresAt < t) delete db.links[k]
}

/** Create a pairing code for a Telegram user (claimed on the web link page). */
export function createPairing(telegramId: number, code: string): void {
  const db = load()
  prune(db)
  db.pending[code] = { telegramId, expiresAt: now() + PAIR_TTL_MS }
  save(db)
}

/** Claim a pairing code: bind the (sealed) agent key to its Telegram user. */
export function completePairing(opts: {
  code: string
  agentAddress: string
  sealedKey: string
  ttlMs: number
  policyMaxMnt: number
}): { telegramId: number } | { error: string } {
  const db = load()
  prune(db)
  const pending = db.pending[opts.code]
  if (!pending) return { error: 'pairing code invalid or expired' }
  delete db.pending[opts.code]
  db.links[String(pending.telegramId)] = {
    telegramId: pending.telegramId,
    agentAddress: opts.agentAddress,
    sealedKey: opts.sealedKey,
    createdAt: now(),
    expiresAt: now() + opts.ttlMs,
    policyMaxMnt: opts.policyMaxMnt,
  }
  save(db)
  return { telegramId: pending.telegramId }
}

/** The live session for a Telegram user, or null (unpaired / expired). */
export function getLink(telegramId: number): TgLink | null {
  const db = load()
  prune(db)
  const link = db.links[String(telegramId)]
  return link ?? null
}

/** Revoke a Telegram user's delegated session (logout / /unlink). */
export function deleteLink(telegramId: number): boolean {
  const db = load()
  const had = !!db.links[String(telegramId)]
  delete db.links[String(telegramId)]
  save(db)
  return had
}
