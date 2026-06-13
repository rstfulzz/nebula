import { describe, expect, it } from 'bun:test'
import { SqliteStorage } from './sqlite'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null)

describe('SqliteStorage', () => {
  it('round-trips a content-addressed blob', async () => {
    const s = new SqliteStorage(':memory:')
    const cid = await s.putBlob(enc('hello mantle'))
    expect(cid).toMatch(/^0x[0-9a-f]{64}$/)
    // Same bytes -> same CID (content addressed, idempotent).
    expect(await s.putBlob(enc('hello mantle'))).toBe(cid)
    expect(dec(await s.getBlob(cid))).toBe('hello mantle')
    expect(await s.getBlob('0xdeadbeef')).toBeNull()
    s.close()
  })

  it('stores + overwrites KV and appends to the log', async () => {
    const s = new SqliteStorage(':memory:')
    await s.putKV('stream1', 'k', enc('v1'))
    await s.putKV('stream1', 'k', enc('v2'))
    expect(dec(await s.getKV('stream1', 'k'))).toBe('v2')
    expect(await s.getKV('stream1', 'missing')).toBeNull()
    const cid = await s.appendLog('stream1', enc('entry'))
    expect(cid).toMatch(/^0x[0-9a-f]{64}$/)
    s.close()
  })
})
