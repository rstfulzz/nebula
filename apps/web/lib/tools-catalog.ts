/**
 * The tools the brain can call, grouped by category (count derived below).
 * Used by Section 2 V5 (Limbs grid).
 */

export type Tool = { name: string; desc: string }
export type ToolCategory = { label: string; tools: Tool[] }

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    label: 'fs',
    tools: [
      { name: 'fs.read', desc: 'read a file from disk' },
      { name: 'fs.write', desc: 'write a file to disk' },
      { name: 'fs.patch', desc: 'apply a substring patch to a file' },
      { name: 'fs.search', desc: 'glob + ripgrep across a directory tree' },
    ],
  },
  {
    label: 'shell',
    tools: [
      { name: 'shell.run', desc: 'execute a shell command (sandboxed)' },
      { name: 'shell.cd', desc: 'change working directory' },
      { name: 'shell.process_start', desc: 'start a long-lived background process' },
      { name: 'shell.process_output', desc: 'read output from a running process' },
      { name: 'shell.process_list', desc: 'list active background processes' },
      { name: 'shell.process_kill', desc: 'terminate a background process' },
    ],
  },
  {
    label: 'browser',
    tools: [
      { name: 'browser.navigate', desc: 'load a URL' },
      { name: 'browser.snapshot', desc: 'capture accessibility tree' },
      { name: 'browser.click', desc: 'click an element' },
      { name: 'browser.type', desc: 'type text into a field' },
      { name: 'browser.scroll', desc: 'scroll page or element' },
      { name: 'browser.press', desc: 'press a key' },
      { name: 'browser.back', desc: 'navigate back in history' },
      { name: 'browser.get_images', desc: 'extract images from page' },
      { name: 'browser.console', desc: 'read browser console output' },
      { name: 'browser.vision', desc: 'describe what is on screen' },
    ],
  },
  {
    label: 'chain',
    tools: [
      { name: 'chain.balance', desc: 'read account balance (CSPR)' },
      { name: 'chain.send', desc: 'send native CSPR (gated)' },
      { name: 'chain.wrap', desc: 'wrap CSPR to WCSPR (gated)' },
      { name: 'chain.unwrap', desc: 'unwrap WCSPR to CSPR (gated)' },
      { name: 'chain.read', desc: 'call contract view function' },
      { name: 'chain.write', desc: 'call any contract write (gated)' },
      { name: 'chain.block', desc: 'read block details' },
      { name: 'chain.gas', desc: 'gas price + CSPR cost of common ops' },
      { name: 'chain.tx', desc: 'fetch + decode tx receipt' },
      { name: 'chain.contract', desc: 'introspect contract + ABI' },
      { name: 'chain.activity', desc: 'recent transfers, optional method decode' },
    ],
  },
  {
    label: 'trade',
    tools: [
      { name: 'swap.best', desc: 'best execution across both venues (gated)' },
      { name: 'swap.compare', desc: 'compare Friendly Market vs CSPR.trade, read-only' },
      { name: 'swap.quote', desc: 'Friendly Market quote, 3-tier fee scan' },
      { name: 'swap.execute', desc: 'Friendly Market swap (gated)' },
      { name: 'moe.quote', desc: 'CSPR.trade quote' },
      { name: 'moe.swap', desc: 'CSPR.trade swap (gated)' },
      { name: 'tokens.info', desc: 'CEP-18 metadata' },
    ],
  },
  {
    label: 'stake',
    tools: [
      { name: 'casper.validators', desc: 'live validator rates' },
      { name: 'casper.staking', desc: 'staking position + rewards' },
      { name: 'casper.stake', desc: 'delegate stake (gated)' },
      { name: 'casper.unstake', desc: 'undelegate stake (gated)' },
      { name: 'casper.redelegate', desc: 'move stake to another validator (gated)' },
      { name: 'casper.claim', desc: 'claim staking rewards (gated)' },
    ],
  },
  {
    label: 'risk',
    tools: [
      { name: 'defi.yields', desc: 'DeFiLlama Casper yields + RWA flags, read-only' },
      { name: 'risk.token', desc: 'pre-trade token vet: exit / liquidity / restricted' },
      { name: 'nansen.labels', desc: 'Nansen counterparty intel + red-flags' },
      { name: 'cex.balance', desc: 'Bybit portfolio, read-only' },
      { name: 'policy.show', desc: 'the active fund-control policy' },
      { name: 'tx.simulate', desc: 'dry-run any call before doing it' },
    ],
  },
  {
    label: 'account',
    tools: [
      { name: 'account.info', desc: 'agent identity + token snapshot' },
      { name: 'account.balance', desc: 'native CSPR position' },
    ],
  },
  {
    label: 'memory',
    tools: [
      { name: 'memory.save', desc: 'write to the local store' },
      { name: 'memory.read', desc: 'read a memory note' },
    ],
  },
  {
    label: 'skills',
    tools: [
      { name: 'skills.list', desc: 'available skills' },
      { name: 'skills.view', desc: 'read a skill body' },
      { name: 'skills.manage', desc: 'enable/disable skills' },
    ],
  },
  {
    label: 'meta',
    tools: [
      { name: 'code.execute', desc: 'sandboxed python/node eval' },
      { name: 'vision.analyze', desc: 'image understanding' },
      { name: 'delegate.task', desc: 'spawn a subagent' },
      { name: 'session.search', desc: 'recall past tool calls' },
      { name: 'web.fetch', desc: 'plain HTTP fetch' },
      { name: 'todo', desc: 'task tracking' },
      { name: 'clarify', desc: 'ask the operator a question' },
      { name: 'tool.search', desc: 'discover deferred tools' },
    ],
  },
]

export const TOTAL_TOOL_COUNT = TOOL_CATEGORIES.reduce((acc, cat) => acc + cat.tools.length, 0)
