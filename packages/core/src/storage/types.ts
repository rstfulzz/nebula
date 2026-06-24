/**
 * Storage interface abstracting the three local-storage primitives used by nebula:
 *   - KV: mutable key→value per namespace
 *   - Log: append-only, returns CID per entry
 *   - Blob: immutable bytes, content-addressed
 *
 * Backed by local files (this project removed the on-chain memory backend), so
 * KV/Log/Blob all resolve against on-disk state rather than a remote indexer.
 */
export interface Storage {
  /** Put a value into a named stream under a key. */
  putKV(streamId: string, key: string, value: Uint8Array): Promise<void>
  /** Get the latest value for (streamId, key) or null. */
  getKV(streamId: string, key: string): Promise<Uint8Array | null>
  /** Append an entry to a stream's log. Returns CID (rootHash) of the entry. */
  appendLog(streamId: string, entry: Uint8Array): Promise<string>
  /** Upload immutable bytes, returns content CID. */
  putBlob(bytes: Uint8Array): Promise<string>
  /** Retrieve bytes by CID. */
  getBlob(cid: string): Promise<Uint8Array | null>
}
