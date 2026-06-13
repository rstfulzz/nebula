import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Storage } from './types'

/**
 * SQLite-backed Storage (via `bun:sqlite`). Replaces the prior decentralized
 * blob backend with a local, zero-infra store — ideal for the agent's
 * encrypted memory and easy to demo. Implements the same three primitives:
 *   - KV:   mutable value per (stream, key)
 *   - Log:  append-only entries, each addressed by content CID
 *   - Blob: immutable, content-addressed bytes
 *
 * CID convention matches LocalStubStorage: `0x` + sha256(bytes) hex.
 */
export class SqliteStorage implements Storage {
  private readonly db: Database

  /** @param path SQLite file path (defaults to in-memory). Parent dir is created. */
  constructor(path = ':memory:') {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true })
    }
    this.db = new Database(path, { create: true })
    this.db.run('PRAGMA journal_mode = WAL;')
    this.db.run(
      `CREATE TABLE IF NOT EXISTS kv (
         stream TEXT NOT NULL,
         key    TEXT NOT NULL,
         value  BLOB NOT NULL,
         PRIMARY KEY (stream, key)
       );`,
    )
    this.db.run(
      `CREATE TABLE IF NOT EXISTS log (
         id     INTEGER PRIMARY KEY AUTOINCREMENT,
         stream TEXT NOT NULL,
         cid    TEXT NOT NULL,
         entry  BLOB NOT NULL,
         ts     INTEGER NOT NULL
       );`,
    )
    this.db.run('CREATE INDEX IF NOT EXISTS log_stream_idx ON log (stream, id);')
    this.db.run(
      `CREATE TABLE IF NOT EXISTS blob (
         cid   TEXT PRIMARY KEY,
         bytes BLOB NOT NULL
       );`,
    )
  }

  async putKV(stream: string, key: string, value: Uint8Array): Promise<void> {
    this.db
      .query('INSERT OR REPLACE INTO kv (stream, key, value) VALUES (?, ?, ?)')
      .run(stream, key, value)
  }

  async getKV(stream: string, key: string): Promise<Uint8Array | null> {
    const row = this.db
      .query('SELECT value FROM kv WHERE stream = ? AND key = ?')
      .get(stream, key) as { value: Uint8Array } | null
    return row ? new Uint8Array(row.value) : null
  }

  async appendLog(stream: string, entry: Uint8Array): Promise<string> {
    const cid = cidOf(entry)
    this.db
      .query('INSERT INTO log (stream, cid, entry, ts) VALUES (?, ?, ?, ?)')
      .run(stream, cid, entry, Date.now())
    return cid
  }

  async putBlob(bytes: Uint8Array): Promise<string> {
    const cid = cidOf(bytes)
    this.db.query('INSERT OR IGNORE INTO blob (cid, bytes) VALUES (?, ?)').run(cid, bytes)
    return cid
  }

  async getBlob(cid: string): Promise<Uint8Array | null> {
    const row = this.db.query('SELECT bytes FROM blob WHERE cid = ?').get(cid) as {
      bytes: Uint8Array
    } | null
    return row ? new Uint8Array(row.bytes) : null
  }

  /** Close the underlying database handle. */
  close(): void {
    this.db.close()
  }
}

function cidOf(bytes: Uint8Array): string {
  return `0x${createHash('sha256').update(bytes).digest('hex')}`
}
