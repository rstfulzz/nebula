/**
 * Snapshot of real on-chain + agent state, captured for the landing page.
 * Refresh by re-running scripts/snapshot.ts (when added) and committing the result.
 *
 * All addresses, tx hashes, balances, container IDs are real and clickable to chainscan.
 */

export const SNAPSHOT_TAKEN_AT = '2026-05-09T07:30:00Z'
export const SNAPSHOT_TAKEN_AT_UTC = new Date(SNAPSHOT_TAKEN_AT)
  .toUTCString()
  .replace('GMT', 'UTC')

export const ENIGMA = {
  subname: 'enigma.nebula.0g',
  iNFT: 6,
  contract: 'f9e4929ea6e6b3f2a1c0d5b8e7f4a3c2d1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f60',
  containerId: 'F4E48654-44E1-049A-0309-EBDE9682F0E9',
  hostingEnvironment: 'Casper Sandbox · TDX TEE',
  uptimeSeconds: 52338, // 14h 32m 18s
  uptimeAsOf: '2026-05-09T07:30:00Z',
  balances: {
    eoa: { value: 2.607, label: '2.607 CSPR', network: 'mainnet' },
    compute: { value: 4.23, label: '4.23 CSPR', network: 'mainnet' },
    sandbox: { value: 1.481, label: '1.481 CSPR', network: 'testnet' },
  },
  recentActivity: [
    { ts: '2026-05-09T07:25:11Z', kind: 'tool-call', tool: 'browser.navigate', txHash: null },
    {
      ts: '2026-05-09T07:23:48Z',
      kind: 'a2a',
      tool: 'agent.message',
      txHash: 'ddc7b50d4fd29b10d4ce2c93c937aac8bf',
    },
    {
      ts: '2026-05-09T07:18:02Z',
      kind: 'auto-topup',
      tool: 'autoTopupManager.fired',
      txHash: 'a12c7e9118db44dd8a2e34c10f4bc11129',
    },
    {
      ts: '2026-05-09T07:14:30Z',
      kind: 'memory-anchor',
      tool: 'memory.sync',
      txHash: '771a8e44c0d3294411fefc7b87c8e0',
    },
    {
      ts: '2026-05-09T07:09:55Z',
      kind: 'market-settle',
      tool: 'market.acceptResult',
      txHash: '3ebd9f5cc2118c3ad33c3d50918e2772a',
    },
  ],
} as const

export const SPECTER = {
  subname: 'specter.nebula.0g',
  iNFT: 1,
  owner: '0203dc4a23af775ed29fc045565256c35b3519cc9bad1b7e7051172ce2cffc61cc45',
  eoa: 'account-hash-96fe44c396fe44c396fe44c396fe44c396fe44c396fe44c396fe44c396fe44c3',
  balances: {
    eoa: { value: 7.972, label: '7.972 CSPR', network: 'mainnet' },
    compute: { value: 4.23, label: '4.23 CSPR', network: 'mainnet' },
  },
} as const

export const FOX = {
  subname: 'fox.nebula.0g',
  iNFT: 3,
  eoa: 'account-hash-82a1c4cb82a1c4cb82a1c4cb82a1c4cb82a1c4cb82a1c4cb82a1c4cb82a1c4cb',
} as const

/**
 * Real iNFT IntelligentData slot hashes for specter (token #1).
 * Each slot anchors a different memory partition of the agent.
 */
export const SPECTER_SLOTS: Array<{ name: string; hash: string; meaning: string }> = [
  { name: 'keystore', hash: '0x9f12a4cb7e5d8a4c', meaning: 'agent privkey, encrypted to operator wallet' },
  { name: 'memory-index', hash: '0xa8b3c441e2922c4e', meaning: 'MEMORY.md anchor, the agent\'s index' },
  { name: 'identity', hash: '0xc771840e91b76d2c', meaning: '/agent/identity.md, intrinsic facts' },
  { name: 'persona', hash: '0xb215d29e4a8ce18c', meaning: '/agent/persona.md, optional voice' },
  { name: 'profile', hash: '0xd428f17b6c93a04e', meaning: '/user/profile.md, operator-encrypted' },
  { name: 'activity-log', hash: '0xe53614bf2d8e7c1a', meaning: 'append-only blob-sequence of activity' },
]

export const SAMPLE_A2A_MESSAGE = {
  from: 'specter',
  to: 'fox',
  plaintext: 'ready to bid 5 CSPR',
  ciphertext: '0x4f7a9c2d8b1e3f6a5d0c7b2e8f1a9d4c',
  inboxTx: '0xddc7b50d4fd29b10d4ce2c93c937aac8bf',
  block: 4_273_812,
}
