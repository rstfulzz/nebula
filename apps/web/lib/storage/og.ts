// Off-chain content store (browser reader). Read-only, content-addressed by hash.
//
// On Casper, large agent blobs (memory, keystore, profile) live off-chain and are
// anchored on-chain by hash. This module fetches a blob by its content hash via
// the local /api/blob/<hash> proxy. The proxy is the single place that knows the
// concrete storage backend (IPFS / CSPR.cloud object store), so the client stays
// backend-agnostic.

export type ContentHash = string

/**
 * Fetch a blob by its content hash through the server-side proxy. The proxy
 * handles the storage backend + any CORS concerns.
 */
export async function fetchBlobByRootHash(rootHash: ContentHash): Promise<Uint8Array> {
  const resp = await fetch(`/api/blob/${rootHash}`)
  if (!resp.ok) {
    throw new Error(`blob fetch failed: ${resp.status} ${resp.statusText}`)
  }
  const buf = await resp.arrayBuffer()
  return new Uint8Array(buf)
}
