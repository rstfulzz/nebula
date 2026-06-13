/**
 * tmux driver for `nebula status`. Confirms the command exits cleanly and
 * prints the canonical state lines (network, iNFT, operator, agent, brain).
 */
import { runOneShot, runTmuxTest } from './_tmux'

const REQUIRED_FIELDS = [
  /network\s+0g-(testnet|mainnet)/,
  /iNFT\s+#\d+/,
  /operator\s+0x[0-9a-fA-F]{40}/,
  /agent EOA\s+0x[0-9a-fA-F]{40}/,
  /brain\s+0x[0-9a-fA-F]{40}/,
]

await runTmuxTest(`nebula-status-${process.pid}`, async s => {
  const { exit, pane } = await runOneShot(s, 'bun packages/cli/bin/nebula status', 30_000)
  if (exit !== 0) throw new Error(`status exited with code ${exit}`)
  for (const required of REQUIRED_FIELDS) {
    if (!required.test(pane)) throw new Error(`status output missing ${required}`)
  }
  console.log('[ok] nebula status — all 5 required fields present')
})
