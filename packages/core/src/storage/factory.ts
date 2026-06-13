import { join } from 'node:path'
import { agentPaths } from '../paths'
import { SqliteStorage } from './sqlite'
import type { Storage } from './types'

let singleton: SqliteStorage | null = null

/**
 * Shared, content-addressed local store at `~/.nebula/storage.sqlite`.
 * Blobs are addressed by their `0x`+sha256 CID, so a single store serves all
 * agents (a blob put by one is fetchable by hash from any). KV/log entries are
 * namespaced by streamId. Replaces the prior decentralized storage backend.
 */
export function getStorage(): Storage {
  if (!singleton) {
    singleton = new SqliteStorage(join(agentPaths.root, 'storage.sqlite'))
  }
  return singleton
}

/**
 * Back-compat shim for the old "download blob by on-chain root hash" call.
 * Blobs are content-addressed (rootHash === CID), so this is just `getBlob`.
 * The network arg is ignored; kept so existing call sites need no reshaping.
 */
export async function downloadBlobByRoot(
  _network: unknown,
  rootHash: string,
): Promise<Uint8Array | null> {
  return getStorage().getBlob(rootHash)
}
