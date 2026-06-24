import type { PermissionRequest } from 'nebula-ai-core'
import { shortAddr } from '../util/format'

/**
 * Body line for the approval modal. Friendly text for value-moving onchain
 * kinds; falls back to command/path for shell.run / fs.write / code.execute.
 *
 * Casper value-moving tools (casper.send / casper.stake / casper.unstake) all
 * map to the generic `chain.send` permission kind; the `token` field carries a
 * label (`CSPR`, `stake`, `unstake`) and `recipient` the validator or public
 * key / account hash being targeted.
 */
export function summarizeApprovalSubject(req: PermissionRequest): string {
  const amt = req.amount ?? ''
  const tok = req.token ?? ''
  switch (req.kind) {
    case 'chain.send': {
      const tokenLabel = tok || 'CSPR'
      return `send ${amt} ${tokenLabel} to ${shortAddr(req.recipient)}`
    }
    case 'chain.swap':
      if (!amt && !tok) return 'swap'
      return `swap ${amt} ${tok}`.trim()
    case 'chain.write': {
      const valuePart = amt ? ` (value: ${amt})` : ''
      const onPart = req.recipient ? ` on ${shortAddr(req.recipient)}` : ''
      return `${req.command ?? '?'}${valuePart}${onPart}`
    }
    default:
      return req.command ?? req.path ?? '(unspecified)'
  }
}
