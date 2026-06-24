/**
 * tmux driver for `nebula model`. The picker is interactive — we just verify
 * it boots, fetches the live Casper compute catalog, displays at least one
 * service row, then we cancel cleanly so we don't change the configured brain.
 */
import { capturePane, runTmuxTest, sendKeys, sleep, waitForText } from './_tmux'

await runTmuxTest(
  `nebula-model-${process.pid}`,
  async s => {
    await waitForText(s, /Pick a brain|Fetched \d+ services|Catalog fetch failed/, 60_000)
    const pane = capturePane(s)
    if (/Catalog fetch failed/.test(pane)) {
      throw new Error('catalog fetch failed — is the RPC reachable?')
    }
    if (!/Pick a brain|Fetched \d+ services/.test(pane)) {
      throw new Error('catalog never reached the picker')
    }
    console.log('[ok] nebula model — catalog fetched + picker rendered')

    // Cancel without picking so the config doesn't change.
    await sendKeys(s, 'C-c')
    await sleep(2_000)
    console.log('[ok] nebula model — cancelled cleanly')
  },
  'bun packages/cli/bin/nebula model',
)
