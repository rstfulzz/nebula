/**
 * Fast unlock via the password profile, for commands that need the agent key.
 * Returns the agent private key from a live session, or by prompting for the
 * profile password (refreshing the session), or null to fall back to the
 * operator-signature unlock. Never throws — a wrong password returns null.
 */
import { isCancel, password } from '@clack/prompts'
import { decryptSecret } from './crypto'
import { readProfile, readSession, writeSession } from './store'

// The agent private key is a hex-encoded Casper secp256k1 scalar (plain string).
export async function tryProfileUnlock(agentAddress: string): Promise<string | null> {
  const now = Date.now()
  const session = await readSession(now, agentAddress)
  if (session) return session.privkey

  const profile = await readProfile()
  if (!profile || profile.address.toLowerCase() !== agentAddress.toLowerCase()) return null

  const pw = await password({ message: 'Profile password' })
  if (isCancel(pw)) return null
  try {
    const pk = decryptSecret(profile.cipher, String(pw))
    await writeSession(profile.address, pk, now)
    return pk
  } catch {
    return null // wrong password → caller falls back to operator unlock
  }
}
