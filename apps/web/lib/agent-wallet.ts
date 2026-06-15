// Deterministic agent wallet, derived from a signature by the user's main
// wallet over a fixed message. The same main wallet always yields the same agent
// wallet — so the web and the CLI (which signs the identical message with the
// operator wallet) resolve to the SAME agent wallet, with nothing stored or
// copied between them.
//
// This relies on the wallet producing a deterministic signature for the message
// (RFC-6979 ECDSA — MetaMask and most software wallets do this). The agent key
// is keccak256 of that signature.
import { type Hex, keccak256, stringToHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// Versioned + explicit so the user knows what they're signing. Changing this
// string changes the derived wallet — keep it stable.
export const AGENT_DERIVE_MESSAGE =
  'nebula · derive my agent wallet (v1)\n\n' +
  'Signing this proves you own this wallet and unlocks your deterministic Mantle ' +
  'agent wallet. This signature IS your agent key — only ever sign it on nebula.'

export function deriveAgentPrivateKey(signature: Hex): Hex {
  return keccak256(signature)
}

/** Derive the agent account (address + signer) from a main-wallet signature. */
export function deriveAgentAccount(signature: Hex) {
  return privateKeyToAccount(deriveAgentPrivateKey(signature))
}

/** Hex of the fixed derive message, for callers that sign raw. */
export const AGENT_DERIVE_MESSAGE_HEX = stringToHex(AGENT_DERIVE_MESSAGE)
