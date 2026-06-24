import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk'
import { RawPrivkeyOperatorSigner } from '../operator/raw-privkey'
import {
  DEFAULT_OPERATOR_SESSION_TTL_MS,
  OPERATOR_BLOB_SCOPES,
  OPERATOR_SESSION_VERSION,
  buildOperatorSession,
  clearOperatorSession,
  deriveBlobKey,
  deriveKeystoreKey,
  getSessionKey,
  isOperatorSessionComplete,
  isOperatorSessionFresh,
  operatorSessionPath,
  precomputeAllScopes,
  readOperatorSession,
  requiredScopesForAgent,
  writeOperatorSession,
} from './index'

// Pin agentPaths to a tmp dir via NEBULA_ROOT (paths.ts respects this).
const TEST_AGENT_ID = 'feedfeedfeedfeed'
const ORIGINAL_NEBULA_ROOT = process.env.NEBULA_ROOT

/** A 32-byte AES key serialized as plain hex (the operator-session key shape). */
const key32 = (byte: number): string => byte.toString(16).padStart(2, '0').repeat(32)

/** A random 32-byte secret key hex (operator private key material). */
function randomPrivkey(): string {
  return randomBytes(32).toString('hex')
}

/** A stable Casper public key hex used as the agent address. */
function randomAgentAddress(): string {
  return PrivateKey.fromHex(randomPrivkey(), KeyAlgorithm.SECP256K1).publicKey.toHex()
}

beforeEach(() => {
  const tmp = join(tmpdir(), `nebula-op-session-test-${process.pid}-${Date.now().toString(36)}`)
  mkdirSync(join(tmp, 'agents', TEST_AGENT_ID), { recursive: true })
  process.env.NEBULA_ROOT = tmp
})

afterEach(() => {
  if (process.env.NEBULA_ROOT?.includes('nebula-op-session-test')) {
    try {
      rmSync(process.env.NEBULA_ROOT, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
  if (ORIGINAL_NEBULA_ROOT === undefined) process.env.NEBULA_ROOT = undefined
  else process.env.NEBULA_ROOT = ORIGINAL_NEBULA_ROOT
})

describe('operatorSessionPath', () => {
  test('returns ~/.nebula/agents/<id>/.operator-session', () => {
    const p = operatorSessionPath(TEST_AGENT_ID)
    expect(p.endsWith(`/agents/${TEST_AGENT_ID}/.operator-session`)).toBe(true)
  })
})

describe('writeOperatorSession + readOperatorSession', () => {
  test('round-trips a session', () => {
    const sess = buildOperatorSession({
      agent: '0203321ecdd83e72df73fdd2af8cf6505e4f18521cb6225cdae8665e5f1e3f7245d5',
      keys: { keystore: key32(0xaa) },
    })
    writeOperatorSession(TEST_AGENT_ID, sess)
    const got = readOperatorSession(TEST_AGENT_ID)
    expect(got).not.toBeNull()
    expect(got?.agent).toBe(sess.agent)
    expect(got?.keys.keystore).toBe(sess.keys.keystore)
    expect(got?.expiresAt).toBe(sess.expiresAt)
    expect(got?.version).toBe(OPERATOR_SESSION_VERSION)
  })

  test('writes file at perm 0600', () => {
    const sess = buildOperatorSession({
      agent: 'agent-1',
      keys: { keystore: key32(0xbb) },
    })
    writeOperatorSession(TEST_AGENT_ID, sess)
    const stat = statSync(operatorSessionPath(TEST_AGENT_ID))
    expect(stat.mode & 0o777).toBe(0o600)
  })

  test('returns null when file does not exist', () => {
    expect(readOperatorSession(TEST_AGENT_ID)).toBeNull()
  })

  test('returns null + cleans up when expired', () => {
    const sess: ReturnType<typeof buildOperatorSession> = {
      version: OPERATOR_SESSION_VERSION,
      agent: 'agent-1',
      keys: { keystore: key32(0xcc) },
      expiresAt: Date.now() - 1000,
      createdAt: Date.now() - 5000,
    }
    writeOperatorSession(TEST_AGENT_ID, sess)
    expect(existsSync(operatorSessionPath(TEST_AGENT_ID))).toBe(true)
    const got = readOperatorSession(TEST_AGENT_ID)
    expect(got).toBeNull()
    expect(existsSync(operatorSessionPath(TEST_AGENT_ID))).toBe(false)
  })

  test('returns null on malformed JSON', async () => {
    const path = operatorSessionPath(TEST_AGENT_ID)
    await Bun.write(path, '{not-json')
    expect(readOperatorSession(TEST_AGENT_ID)).toBeNull()
  })

  test('returns null on wrong version', async () => {
    const path = operatorSessionPath(TEST_AGENT_ID)
    await Bun.write(
      path,
      JSON.stringify({ version: 99, agent: 'a', keys: {}, expiresAt: 0, createdAt: 0 }),
    )
    expect(readOperatorSession(TEST_AGENT_ID)).toBeNull()
  })
})

describe('isOperatorSessionFresh', () => {
  test('false when no session', () => {
    expect(isOperatorSessionFresh(TEST_AGENT_ID)).toBe(false)
  })

  test('true after writing fresh session', () => {
    writeOperatorSession(
      TEST_AGENT_ID,
      buildOperatorSession({
        agent: 'agent-2',
        keys: { keystore: key32(0xdd) },
      }),
    )
    expect(isOperatorSessionFresh(TEST_AGENT_ID)).toBe(true)
  })
})

describe('clearOperatorSession', () => {
  test('removes existing session file', () => {
    writeOperatorSession(
      TEST_AGENT_ID,
      buildOperatorSession({
        agent: 'agent-3',
        keys: { keystore: key32(0xee) },
      }),
    )
    expect(existsSync(operatorSessionPath(TEST_AGENT_ID))).toBe(true)
    clearOperatorSession(TEST_AGENT_ID)
    expect(existsSync(operatorSessionPath(TEST_AGENT_ID))).toBe(false)
  })

  test('no-op when file does not exist', () => {
    expect(() => clearOperatorSession(TEST_AGENT_ID)).not.toThrow()
  })
})

describe('getSessionKey', () => {
  test('retrieves keystore key as 32-byte Buffer', () => {
    writeOperatorSession(
      TEST_AGENT_ID,
      buildOperatorSession({
        agent: 'agent-4',
        keys: { keystore: key32(0xff) },
      }),
    )
    const got = getSessionKey(TEST_AGENT_ID, 'keystore')
    expect(got).not.toBeNull()
    expect(got?.length).toBe(32)
    expect(got?.equals(Buffer.alloc(32, 0xff))).toBe(true)
  })

  test('retrieves scope key (telegram)', () => {
    writeOperatorSession(
      TEST_AGENT_ID,
      buildOperatorSession({
        agent: 'agent-5',
        keys: { keystore: key32(0xa0), [OPERATOR_BLOB_SCOPES.TELEGRAM]: key32(0xa1) },
      }),
    )
    const got = getSessionKey(TEST_AGENT_ID, OPERATOR_BLOB_SCOPES.TELEGRAM)
    expect(got).not.toBeNull()
    expect(got?.equals(Buffer.alloc(32, 0xa1))).toBe(true)
  })

  test('returns null for missing scope', () => {
    writeOperatorSession(
      TEST_AGENT_ID,
      buildOperatorSession({
        agent: 'agent-6',
        keys: { keystore: key32(0) },
      }),
    )
    expect(getSessionKey(TEST_AGENT_ID, 'nonexistent-scope')).toBeNull()
  })

  test('returns null when no session at all', () => {
    expect(getSessionKey(TEST_AGENT_ID, 'keystore')).toBeNull()
  })

  test('throws on corrupt key length (not 32 bytes)', () => {
    writeOperatorSession(
      TEST_AGENT_ID,
      buildOperatorSession({
        agent: 'agent-7',
        keys: { keystore: 'deadbeef' },
      }),
    )
    expect(() => getSessionKey(TEST_AGENT_ID, 'keystore')).toThrow(/corrupt key/)
  })
})

describe('buildOperatorSession', () => {
  test('default TTL is 24h', () => {
    const before = Date.now()
    const sess = buildOperatorSession({
      agent: 'agent-7',
      keys: { keystore: key32(0) },
    })
    const after = Date.now()
    const expected = before + DEFAULT_OPERATOR_SESSION_TTL_MS
    const slop = 100
    expect(sess.expiresAt).toBeGreaterThanOrEqual(expected - slop)
    expect(sess.expiresAt).toBeLessThanOrEqual(after + DEFAULT_OPERATOR_SESSION_TTL_MS + slop)
  })

  test('custom TTL respected', () => {
    const sess = buildOperatorSession({
      agent: 'agent-8',
      keys: { keystore: key32(0) },
      expiresInMs: 60_000,
    })
    expect(sess.expiresAt - sess.createdAt).toBeLessThanOrEqual(60_000 + 100)
  })

  test('preserves all scope keys provided', () => {
    const sess = buildOperatorSession({
      agent: 'agent-9',
      keys: { keystore: key32(1), [OPERATOR_BLOB_SCOPES.TELEGRAM]: key32(2) },
    })
    expect(sess.keys.keystore).toBe(key32(1))
    expect(sess.keys[OPERATOR_BLOB_SCOPES.TELEGRAM]).toBe(key32(2))
  })
})

describe('requiredScopesForAgent + isOperatorSessionComplete', () => {
  test('requiredScopesForAgent returns only keystore when no encrypted blobs exist', () => {
    const required = requiredScopesForAgent(TEST_AGENT_ID)
    expect(required).toEqual(['keystore'])
  })

  test('requiredScopesForAgent adds telegram scope when telegram-secrets.encrypted exists', () => {
    const dir = join(process.env.NEBULA_ROOT ?? '', 'agents', TEST_AGENT_ID)
    writeFileSync(join(dir, 'telegram-secrets.encrypted'), Buffer.from('placeholder'))
    const required = requiredScopesForAgent(TEST_AGENT_ID)
    expect(required).toEqual(['keystore', OPERATOR_BLOB_SCOPES.TELEGRAM])
  })

  test('isOperatorSessionComplete returns false when no session exists', () => {
    expect(isOperatorSessionComplete(TEST_AGENT_ID, ['keystore'])).toBe(false)
  })

  test('isOperatorSessionComplete returns true when session has all required scopes', () => {
    const sess = buildOperatorSession({
      agent: 'agent-10',
      keys: { keystore: key32(1), [OPERATOR_BLOB_SCOPES.TELEGRAM]: key32(2) },
    })
    writeOperatorSession(TEST_AGENT_ID, sess)
    expect(
      isOperatorSessionComplete(TEST_AGENT_ID, ['keystore', OPERATOR_BLOB_SCOPES.TELEGRAM]),
    ).toBe(true)
  })

  test('isOperatorSessionComplete returns FALSE when session is fresh but missing a required scope', () => {
    // Timestamp-fresh but missing the telegram scope key. isOperatorSessionFresh
    // returns true, isOperatorSessionComplete must return false so the caller
    // re-derives.
    const sess = buildOperatorSession({
      agent: 'agent-11',
      keys: { keystore: key32(1) }, // no TELEGRAM scope
    })
    writeOperatorSession(TEST_AGENT_ID, sess)
    expect(isOperatorSessionFresh(TEST_AGENT_ID)).toBe(true)
    expect(
      isOperatorSessionComplete(TEST_AGENT_ID, ['keystore', OPERATOR_BLOB_SCOPES.TELEGRAM]),
    ).toBe(false)
  })

  test('isOperatorSessionComplete tolerates expired session by returning false', () => {
    const sess = buildOperatorSession({
      agent: 'agent-12',
      keys: { keystore: key32(1), [OPERATOR_BLOB_SCOPES.TELEGRAM]: key32(2) },
      expiresInMs: 1, // immediately expired
    })
    writeOperatorSession(TEST_AGENT_ID, sess)
    // Wait a tick to ensure expiry registers.
    const expired = new Promise<void>(r => setTimeout(r, 10))
    return expired.then(() => {
      expect(
        isOperatorSessionComplete(TEST_AGENT_ID, ['keystore', OPERATOR_BLOB_SCOPES.TELEGRAM]),
      ).toBe(false)
    })
  })
})

// -- precomputeAllScopes ----------------------------------------------------

describe('precomputeAllScopes', () => {
  test('without verifyKey: parallel derivation matches direct derive', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agent = randomAgentAddress()
    const keys = await precomputeAllScopes(signer, agent, [
      OPERATOR_BLOB_SCOPES.PROFILE,
      OPERATOR_BLOB_SCOPES.TELEGRAM,
    ])
    // Both extras present + match direct derive.
    expect(keys.keystore).toBe((await deriveKeystoreKey(signer, agent)).toString('hex'))
    expect(keys[OPERATOR_BLOB_SCOPES.PROFILE]).toBe(
      (await deriveBlobKey(signer, agent, OPERATOR_BLOB_SCOPES.PROFILE)).toString('hex'),
    )
    expect(keys[OPERATOR_BLOB_SCOPES.TELEGRAM]).toBe(
      (await deriveBlobKey(signer, agent, OPERATOR_BLOB_SCOPES.TELEGRAM)).toString('hex'),
    )
  })

  test('verifyKey passes: keystore cached, extra scopes retained', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agent = randomAgentAddress()
    const canonicalKeystoreKey = await deriveKeystoreKey(signer, agent)

    let verifyCalls = 0
    const verifyKey = async (scope: string, key: Buffer): Promise<boolean> => {
      verifyCalls++
      if (scope === 'keystore') return key.equals(canonicalKeystoreKey)
      if (scope === OPERATOR_BLOB_SCOPES.PROFILE) {
        const profileKey = await deriveBlobKey(signer, agent, OPERATOR_BLOB_SCOPES.PROFILE)
        return key.equals(profileKey)
      }
      return true
    }
    const keys = await precomputeAllScopes(signer, agent, [OPERATOR_BLOB_SCOPES.PROFILE], {
      verifyKey,
    })
    expect(keys.keystore).toBe(canonicalKeystoreKey.toString('hex'))
    expect(keys[OPERATOR_BLOB_SCOPES.PROFILE]).toBeDefined()
    expect(verifyCalls).toBeGreaterThanOrEqual(2) // at least keystore + profile
  })

  test('verifyKey fails on keystore: throws (operator wallet does not match)', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agent = randomAgentAddress()
    const verifyKey = async (_scope: string, _key: Buffer): Promise<boolean> => false
    await expect(
      precomputeAllScopes(signer, agent, [OPERATOR_BLOB_SCOPES.PROFILE], { verifyKey }),
    ).rejects.toThrow(/keystore decrypt verification failed/)
  })

  test('verifyKey fails on an extra scope: that scope is dropped, keystore retained', async () => {
    const signer = new RawPrivkeyOperatorSigner({ privkey: randomPrivkey() })
    const agent = randomAgentAddress()
    const verifyKey = async (scope: string, _key: Buffer): Promise<boolean> => scope === 'keystore' // keystore passes; extras fail
    const keys = await precomputeAllScopes(signer, agent, [OPERATOR_BLOB_SCOPES.PROFILE], {
      verifyKey,
    })
    expect(keys.keystore).toBeDefined()
    expect(keys[OPERATOR_BLOB_SCOPES.PROFILE]).toBeUndefined()
  })
})
