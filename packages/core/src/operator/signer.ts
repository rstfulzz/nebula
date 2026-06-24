/**
 * The operator is the human (or organization) behind a nebula agent. On Casper
 * the operator's wallet OWNS the agent identity token (CEP-78); a separate agent
 * account (derived by `nebula agent`) is the pay-for-infra key that signs deploys.
 *
 * Operator signing material can come from several sources. First-class sources:
 * - OS keychain (macOS Keychain; later libsecret + Credential Manager)
 * - Encrypted keystore file (PEM secret key)
 * - Raw private key (CLI/scripting, env var, or stdin prompt)
 *
 * All resolve to a casper-js-sdk `PrivateKey` (ed25519 or secp256k1). This
 * interface is the abstraction a caller uses without caring which source is
 * behind it, so the init flow, telegram-secret flow, and agent-derivation flow
 * can pick at runtime.
 *
 * Casper signs raw messages, not structured typed-data; the keystore-crypto layer derives
 * its AEAD key from a deterministic signature over a fixed message. Casper
 * ECDSA/EdDSA signing is deterministic (RFC 6979 / Ed25519), so the same
 * operator key + same message always yields the same signature → same key.
 */

/**
 * A connected operator account exposing the signing primitives the harness
 * needs. Backed by a casper-js-sdk `PrivateKey` for local sources, or a remote
 * signer for future hardware/mobile sources.
 */
export interface OperatorAccount {
  /** Casper public key hex (`01…` ed25519 / `02…` secp256k1). */
  readonly publicKeyHex: string
  /**
   * Sign a UTF-8 message and return the signature as hex (no algorithm-tag
   * prefix). Used by the deterministic agent-wallet derivation: the operator
   * signs `AGENT_DERIVE_MESSAGE`, blake2b of the signature is the agent key.
   */
  signMessage(opts: { message: string }): Promise<string>
  /**
   * Sign the structured keystore-unlock message for `(agent, scope)` and return
   * the raw 64-byte signature as hex. Deterministic per `(operatorKey, agent,
   * scope)`, so it reliably re-derives the AEAD key for the encrypted keystore
   * and scoped operator blobs.
   */
  signKeystore(opts: { agent: string; scope: string }): Promise<string>
}

export interface OperatorSigner {
  /** Source label for logs + UI ("keychain:<service>", "keystore:<path>", ...). */
  readonly source: string
  /** Operator's Casper public key hex. Owns the agent identity token. */
  publicKeyHex(): Promise<string>
  /** The connected account exposing the signing primitives. */
  account(): Promise<OperatorAccount>
  /**
   * Optional teardown. Local sources have nothing to release; reserved for
   * future remote signers. Safe to call unconditionally.
   */
  close?(): Promise<void>
}
