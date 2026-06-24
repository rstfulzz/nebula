/**
 * Operator-signature auth for the gateway provisioning + control plane.
 *
 * Casper-native: the operator signs a deterministic blake2b-256 digest with its
 * secp256k1/ed25519 key. We verify the signature against the operator's known
 * public key (`PublicKey.verifySignature`) — Casper verifies against a key
 * rather than recovering one, so `expectedOperator` is a public-key hex.
 *
 * Identities here are public-key hex strings; signatures are the hex of the
 * algorithm-tagged Casper signature (`PrivateKey.signAndAddAlgorithmBytes`).
 * Digests are anchored to the harness bootstrap pubkey + config hash so a
 * stolen envelope cannot be replayed against a different harness or config.
 */
import { blake2b } from '@noble/hashes/blake2.js'
import { PublicKey } from 'casper-js-sdk'
import type { RuntimeConfig } from './runtime'

const ZERO_DIGEST = `0x${'0'.repeat(64)}`

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

/** blake2b-256 (Casper's hash) over a UTF-8 string → `0x`-prefixed hex digest. */
function blake256(input: string): string {
  return `0x${bytesToHex(blake2b(new TextEncoder().encode(input), { dkLen: 32 }))}`
}

/** Agent reference carried in a (legacy remote) provision request. */
interface ProvisionAgentRef {
  /** Identity token contract package hash (CEP-78). */
  contract: string
  tokenId: string
}

export interface ProvisionEnvelope {
  ephPubkeyHex: string
  ivHex: string
  tagHex: string
  ciphertextHex: string
}

export interface ProvisionRequest {
  envelope: ProvisionEnvelope
  /**
   * Optional second ECIES envelope sealing the harness secrets JSON
   * (telegram bot token + allowlist, etc.). Sealed to the same bootstrap
   * pubkey. The operator's signature covers both envelopes so a stolen
   * secrets envelope can't be replayed against a different harness.
   */
  secretsEnvelope?: ProvisionEnvelope
  /** Operator public key hex (`01…` ed25519 / `02…` secp256k1). */
  operatorAddress: string
  iNFTRef: ProvisionAgentRef
  config: RuntimeConfig
  ts: number
}

function envelopeHash(env: ProvisionEnvelope): string {
  return blake256(
    `eph:${env.ephPubkeyHex}|iv:${env.ivHex}|tag:${env.tagHex}|ct:${env.ciphertextHex}`,
  )
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  // Skip undefined-valued keys to match `JSON.stringify` semantics. Critical
  // because the wire path is `JSON.stringify` → JSON.parse, which silently
  // drops undefined object values. If we hashed them as the literal text
  // `undefined`, the CLI's pre-wire hash and the harness's post-wire hash
  // would diverge for any optional field the caller leaves unset (e.g.
  // `RuntimeConfig.promptAppend`), surfacing as `provision-rejected: sig-mismatch`.
  const v = value as Record<string, unknown>
  const keys = Object.keys(v)
    .filter(k => v[k] !== undefined)
    .sort()
  const props = keys.map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
  return `{${props.join(',')}}`
}

function configHash(config: RuntimeConfig): string {
  // Stable JSON via recursive key-sorted stringify; harness + client must agree.
  return blake256(stableStringify(config))
}

/**
 * Build the deterministic digest the operator signs over. Anchored to the
 * harness bootstrap pubkey + config hash so a stolen envelope cannot be replayed
 * against a different harness or a different runtime config.
 */
export function provisionMessageHash(req: ProvisionRequest, bootstrapPubkey: string): string {
  // A secretsEnvelopeHash lets a second envelope ship telegram secrets etc.
  // alongside the agent privkey. Zero-digest sentinel preserves the digest when
  // no secrets envelope is sent.
  const secretsHash = req.secretsEnvelope ? envelopeHash(req.secretsEnvelope) : ZERO_DIGEST
  return blake256(
    [
      `env:${envelopeHash(req.envelope)}`,
      `sec:${secretsHash}`,
      `cfg:${configHash(req.config)}`,
      `op:${req.operatorAddress}`,
      `inft:${req.iNFTRef.contract}`,
      `tok:${req.iNFTRef.tokenId}`,
      `ts:${req.ts}`,
      `boot:${bootstrapPubkey}`,
    ].join('|'),
  )
}

export interface VerifyOpts {
  request: ProvisionRequest
  /** Hex of the algorithm-tagged Casper signature. */
  signature: string
  bootstrapPubkey: string
  /** Operator public key hex. */
  expectedOperator: string
  /** Reject ts older than this (default 5min). */
  maxAgeMs?: number
  /** Reject ts further into the future than this (default 1min for clock skew). */
  maxFutureMs?: number
  now?: number
}

export type VerifyResult = { ok: true } | { ok: false; reason: string }

/**
 * Verify a Casper signature over `digestHex` against the operator's public key.
 * `verifySignature` returns true for a good signature and throws for a bad one;
 * both a throw and a false are treated as a mismatch.
 */
function verifyDigest(digestHex: string, signatureHex: string, operatorPubHex: string): boolean {
  try {
    const pub = PublicKey.fromHex(operatorPubHex)
    // The operator signs the digest BYTES and tags the signature with the key
    // algorithm (`signAndAddAlgorithmBytes`); verifySignature wants both.
    return pub.verifySignature(hexToBytes(digestHex), hexToBytes(signatureHex)) !== false
  } catch {
    return false
  }
}

export async function verifyProvisionSig(opts: VerifyOpts): Promise<VerifyResult> {
  const now = opts.now ?? Date.now()
  const maxAge = opts.maxAgeMs ?? 5 * 60 * 1000
  const maxFuture = opts.maxFutureMs ?? 60 * 1000

  if (opts.request.operatorAddress.toLowerCase() !== opts.expectedOperator.toLowerCase()) {
    return { ok: false, reason: 'operator-mismatch' }
  }
  if (opts.request.ts > now + maxFuture) {
    return { ok: false, reason: 'ts-future' }
  }
  if (opts.request.ts < now - maxAge) {
    return { ok: false, reason: 'ts-stale' }
  }

  const hash = provisionMessageHash(opts.request, opts.bootstrapPubkey)
  if (!verifyDigest(hash, opts.signature, opts.expectedOperator)) {
    return { ok: false, reason: 'sig-mismatch' }
  }
  return { ok: true }
}

/**
 * Hash the operator signs to authenticate a chat message turn. Anchored to
 * sandboxId so a chat sig cannot be replayed against a different sandbox
 * harness running on the same operator.
 */
export function chatMessageHash(message: string, ts: number, sandboxId: string): string {
  return blake256(`chat|msg:${message}|ts:${ts}|sbx:${sandboxId}`)
}

export interface VerifyChatOpts {
  message: string
  ts: number
  sandboxId: string
  signature: string
  expectedOperator: string
  maxAgeMs?: number
  maxFutureMs?: number
  now?: number
}

export async function verifyChatSig(opts: VerifyChatOpts): Promise<VerifyResult> {
  const now = opts.now ?? Date.now()
  const maxAge = opts.maxAgeMs ?? 5 * 60 * 1000
  const maxFuture = opts.maxFutureMs ?? 60 * 1000
  if (opts.ts > now + maxFuture) return { ok: false, reason: 'ts-future' }
  if (opts.ts < now - maxAge) return { ok: false, reason: 'ts-stale' }

  const hash = chatMessageHash(opts.message, opts.ts, opts.sandboxId)
  if (!verifyDigest(hash, opts.signature, opts.expectedOperator)) {
    return { ok: false, reason: 'sig-mismatch' }
  }
  return { ok: true }
}

/**
 * Hash the operator signs to authenticate an admin tick (e.g.
 * `POST /admin/autotopup/tick`) against the sandbox endpoint. Anchored to
 * `action` + `sandboxId` so a sig for one admin endpoint can't be replayed
 * against another, and the `chat`/`approval` sig spaces stay isolated from
 * admin operations.
 *
 * `AdminAction` is a documentation-only union of actions currently accepted by
 * sandbox endpoints. The hash + verifier accept arbitrary strings (so
 * cross-action replay tests can sign non-existent actions); the allowlist is
 * enforced at the route layer in `server.ts`.
 *
 *   - 'autotopup-tick'  → POST /admin/autotopup/tick
 *   - 'profile-key'     → POST /admin/profile-key
 *   - 'pairing-approve' → POST /admin/pairing/approve
 */
export type AdminAction = 'autotopup-tick' | 'profile-key' | 'pairing-approve'

export function adminTickHash(opts: {
  action: AdminAction | string
  ts: number
  sandboxId: string
}): string {
  return blake256(`admin|action:${opts.action}|ts:${opts.ts}|sbx:${opts.sandboxId}`)
}

export interface VerifyAdminTickOpts {
  action: AdminAction | string
  ts: number
  sandboxId: string
  signature: string
  expectedOperator: string
  maxAgeMs?: number
  maxFutureMs?: number
  now?: number
}

export async function verifyAdminTickSig(opts: VerifyAdminTickOpts): Promise<VerifyResult> {
  const now = opts.now ?? Date.now()
  const maxAge = opts.maxAgeMs ?? 5 * 60 * 1000
  const maxFuture = opts.maxFutureMs ?? 60 * 1000
  if (opts.ts > now + maxFuture) return { ok: false, reason: 'ts-future' }
  if (opts.ts < now - maxAge) return { ok: false, reason: 'ts-stale' }

  const hash = adminTickHash({ action: opts.action, ts: opts.ts, sandboxId: opts.sandboxId })
  if (!verifyDigest(hash, opts.signature, opts.expectedOperator)) {
    return { ok: false, reason: 'sig-mismatch' }
  }
  return { ok: true }
}

/**
 * Hash the operator signs for an approval response.
 */
export function approvalResponseHash(opts: {
  approvalId: string
  decision: 'allow' | 'allow-session' | 'deny'
  ts: number
  sandboxId: string
}): string {
  return blake256(
    `approval|id:${opts.approvalId}|dec:${opts.decision}|ts:${opts.ts}|sbx:${opts.sandboxId}`,
  )
}

export interface VerifyApprovalOpts {
  approvalId: string
  decision: 'allow' | 'allow-session' | 'deny'
  ts: number
  sandboxId: string
  signature: string
  expectedOperator: string
  maxAgeMs?: number
  maxFutureMs?: number
  now?: number
}

export async function verifyApprovalSig(opts: VerifyApprovalOpts): Promise<VerifyResult> {
  const now = opts.now ?? Date.now()
  const maxAge = opts.maxAgeMs ?? 5 * 60 * 1000
  const maxFuture = opts.maxFutureMs ?? 60 * 1000
  if (opts.ts > now + maxFuture) return { ok: false, reason: 'ts-future' }
  if (opts.ts < now - maxAge) return { ok: false, reason: 'ts-stale' }

  const hash = approvalResponseHash({
    approvalId: opts.approvalId,
    decision: opts.decision,
    ts: opts.ts,
    sandboxId: opts.sandboxId,
  })
  if (!verifyDigest(hash, opts.signature, opts.expectedOperator)) {
    return { ok: false, reason: 'sig-mismatch' }
  }
  return { ok: true }
}
