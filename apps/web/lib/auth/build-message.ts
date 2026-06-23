// Client-safe sign-in message builder. Must produce a message byte-identical to
// what the server parses in lib/auth/messages.ts (verifyCasperSignIn).

export const SIGN_IN_STATEMENT =
  'Sign in to the Nebula console. This signature proves wallet ownership and creates a session cookie. No transactions are sent.'

export function buildSignInMessage(opts: {
  publicKey: string
  chainName: string
  nonce: string
  domain: string
  uri: string
  issuedAt?: string
}): string {
  const issuedAt = opts.issuedAt ?? new Date().toISOString()
  return [
    `${opts.domain} wants you to sign in with your Casper account:`,
    opts.publicKey,
    '',
    SIGN_IN_STATEMENT,
    '',
    `URI: ${opts.uri}`,
    'Version: 1',
    `Chain: ${opts.chainName}`,
    `Nonce: ${opts.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n')
}
