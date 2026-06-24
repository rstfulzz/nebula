import { describe, expect, test } from 'bun:test'
import { generateBootstrapKeypair } from 'nebula-ai-core'
import { ApprovalRelay } from './approval-relay'
import { EventHub } from './events'
import type { RuntimeConfig } from './runtime'
import {
  GATEWAY_VERSION,
  createSession,
  transitionToProvisioned,
  transitionToReady,
  transitionToShuttingDown,
} from './state'
import { StubRuntime } from './stub-runtime'

// Casper public-key hex (`02…` secp256k1). Identity token contract is a CEP-78
// package hash; agent private key is a plain hex string.
const FAKE_OPERATOR = '02021d8f4a3a8d5c5d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7'
const FAKE_AGENT = '0202cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
const FAKE_INFT = 'hash-9e71d79f06f956d4d2666b5c93dafab721c8472100000000000000000000aaaa'
const FAKE_BRAIN_PROVIDER = 'glm'
const FAKE_AGENT_PRIVKEY = `aa${'0'.repeat(62)}`

const FAKE_CONFIG: RuntimeConfig = {
  network: 'casper-mainnet',
  brain: { provider: FAKE_BRAIN_PROVIDER, model: 'glm-5' },
  identity: {
    iNFT: { contract: FAKE_INFT, tokenId: '6' },
    agent: FAKE_AGENT,
  },
}

function newSession() {
  const events = new EventHub()
  return createSession({
    bootstrap: generateBootstrapKeypair(),
    expectedOperatorAddress: FAKE_OPERATOR,
    sandboxId: 'sbx-test',
    events,
    approvals: new ApprovalRelay(events),
    runtime: new StubRuntime(),
  })
}

describe('state machine', () => {
  test('createSession → Bootstrapping with timestamps', () => {
    const s = newSession()
    expect(s.state).toBe('Bootstrapping')
    expect(s.version).toBe(GATEWAY_VERSION)
    expect(s.sandboxId).toBe('sbx-test')
    expect(s.bootedAt).toBeGreaterThan(0)
    expect(s.provisionedAt).toBeNull()
    expect(s.readyAt).toBeNull()
    expect(s.agentPrivkey).toBeNull()
    expect(s.agentAddress).toBeNull()
    expect(s.config).toBeNull()
  })

  test('Bootstrapping → Provisioned populates fields + emits state-change', () => {
    const s = newSession()
    transitionToProvisioned(s, {
      agentPrivkey: FAKE_AGENT_PRIVKEY,
      agentAddress: FAKE_AGENT,
      operatorAddress: FAKE_OPERATOR,
      config: FAKE_CONFIG,
    })
    expect(s.state).toBe('Provisioned')
    expect(s.agentAddress).toBe(FAKE_AGENT)
    expect(s.operatorAddress).toBe(FAKE_OPERATOR)
    expect(s.config?.network).toBe('casper-mainnet')
    expect(s.provisionedAt).toBeGreaterThan(0)
    const events = s.events.buffer()
    expect(events.some(e => e.kind === 'state-change')).toBe(true)
  })

  test('Provisioned → Ready captures readyAt', () => {
    const s = newSession()
    transitionToProvisioned(s, {
      agentPrivkey: FAKE_AGENT_PRIVKEY,
      agentAddress: FAKE_AGENT,
      operatorAddress: FAKE_OPERATOR,
      config: FAKE_CONFIG,
    })
    transitionToReady(s)
    expect(s.state).toBe('Ready')
    expect(s.readyAt).toBeGreaterThan(0)
  })

  test('cannot transition to Provisioned twice', () => {
    const s = newSession()
    const inputs = {
      agentPrivkey: FAKE_AGENT_PRIVKEY,
      agentAddress: FAKE_AGENT,
      operatorAddress: FAKE_OPERATOR,
      config: FAKE_CONFIG,
    }
    transitionToProvisioned(s, inputs)
    expect(() => transitionToProvisioned(s, inputs)).toThrow(/cannot transition to Provisioned/)
  })

  test('cannot transition to Ready from Bootstrapping', () => {
    const s = newSession()
    expect(() => transitionToReady(s)).toThrow(/cannot transition to Ready/)
  })

  test('shutdown is reachable from any state', () => {
    const s = newSession()
    transitionToShuttingDown(s)
    expect(s.state).toBe('ShuttingDown')
  })
})
