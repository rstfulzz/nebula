// Keystore-derivation sign payload for Casper.
//
// The operator signs this fixed message once per agent (via CSPR.click message
// signing) to derive the keystore-decryption AES key. On Casper there is no
// typed-data step — plain message signing is enough; the signature bytes feed
// HKDF (see operator-blob.ts / keystore.ts).

export const KEYSTORE_DOMAIN = {
  name: 'Nebula Keystore',
  version: '1',
} as const

export const KEYSTORE_PURPOSE = 'nebula-keystore-v1'

/**
 * The canonical, human-readable message the operator signs to unlock an agent's
 * keystore. Binds the agent's public key + purpose so a signature for one agent
 * can't unlock another.
 */
export function keystoreSignMessage(agentPublicKey: string): string {
  return [
    `${KEYSTORE_DOMAIN.name} v${KEYSTORE_DOMAIN.version}`,
    `agent: ${agentPublicKey}`,
    `purpose: ${KEYSTORE_PURPOSE}`,
  ].join('\n')
}
