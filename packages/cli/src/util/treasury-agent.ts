/**
 * The delegated treasury agent key (the "one user, one wallet, one agent" mode).
 *
 * The implementation lives in nebula-ai-plugin-onchain (where the treasury tools
 * run); this re-export gives CLI code the same `~/.nebula/treasury-agent.pem`
 * loader without inverting the package dependency.
 */
export {
  type TreasuryAgent,
  loadOrCreateTreasuryAgent,
  treasuryAgentPath,
} from 'nebula-ai-plugin-onchain'
