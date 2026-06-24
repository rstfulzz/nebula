import { test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StubBrain } from '../brain/stub'
import { defineConfig } from '../config'
import { StubIdentity } from '../identity/stub'
import { LocalStubStorage } from '../storage/local-stub'
import { Runtime } from './runtime'

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const prev = process.env.NEBULA_ROOT
  const tmp = mkdtempSync(join(tmpdir(), 'nebula-root-'))
  process.env.NEBULA_ROOT = tmp
  try {
    return await fn(tmp)
  } finally {
    process.env.NEBULA_ROOT = prev
    rmSync(tmp, { recursive: true, force: true })
  }
}

test('runtime boots, seeds memory dir, routes stub brain echo', async () => {
  await withTempRoot(async root => {
    const ownerAddr = '0202c1bd9c1bb1f3a9e8c4d0e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7a8'
    const agentAddr = `02${'a'.repeat(64)}`
    const identity = new StubIdentity(ownerAddr, agentAddr)
    const brain = new StubBrain()
    const storage = new LocalStubStorage(join(root, 'storage-stub-test'))

    const runtime = new Runtime({
      config: defineConfig({ network: 'casper-testnet' }),
      identity,
      brain,
      storage,
    })

    await runtime.start()

    await runtime.fire({
      source: 'stdin',
      payload: { label: 'hello', data: 'hello world' },
    })

    await new Promise(r => setTimeout(r, 50))

    await runtime.stop()
  })
})
