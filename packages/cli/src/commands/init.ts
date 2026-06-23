/**
 * `nebula init` — verify the Casper agent is ready to run.
 */
import { intro, log, outro } from '@clack/prompts'
import { buildCasperOnchainFromEnv, getBalanceMotes, motesToCspr } from 'nebula-ai-plugin-onchain'

export async function runInit(): Promise<void> {
  intro('nebula init — Casper')
  const llm = process.env.OPENAI_API_KEY ?? process.env.NEBULA_LLM_API_KEY
  const lines: string[] = [
    `${llm ? '✓' : '✗'} LLM key      (OPENAI_API_KEY / NEBULA_LLM_API_KEY)`,
    `${process.env.CSPR_CLOUD_API_KEY ? '✓' : '✗'} CSPR.cloud   (CSPR_CLOUD_API_KEY)`,
    `${process.env.CASPER_SECRET_KEY_PATH ? '✓' : '✗'} signer       (CASPER_SECRET_KEY_PATH)`,
  ]
  const ctx = buildCasperOnchainFromEnv()
  lines.push(`  network    ${ctx.network.network} (${ctx.network.chainName})`)
  if (ctx.pub) {
    lines.push(`  pubkey     ${ctx.pub.toHex()}`)
    try {
      const cspr = motesToCspr(await getBalanceMotes(ctx.rpc, ctx.pub))
      lines.push(
        `  balance    ${cspr} CSPR${cspr === 0 ? '  → fund at testnet.cspr.live/tools/faucet' : ''}`,
      )
    } catch {
      lines.push('  balance    (unavailable)')
    }
  }
  log.info(lines.join('\n'))
  const ready = Boolean(llm) && Boolean(process.env.CASPER_SECRET_KEY_PATH)
  outro(ready ? "ready — run 'nebula' to chat" : 'set the missing env (see .env.example), then re-run')
}
