'use client'

import { useMemo, useState } from 'react'
import {
  type Autonomy,
  type DemoAction,
  type DemoPolicy,
  evaluateDemoPolicy,
} from '@/lib/policy-demo'

const A = '0202aaaa…allowlisted'
const B = '0202bbbb…elsewhere'

type Preset = { label: string; policy: DemoPolicy; action: DemoAction; note: string }

const PRESETS: Preset[] = [
  {
    label: 'In-cap send → auto',
    note: 'Small, within the auto ceiling. Executes without asking.',
    policy: { maxNativeMnt: 5, autoMaxNativeMnt: 1, autonomy: 'auto' },
    action: { kind: 'transfer', asset: 'CSPR', amountMnt: 0.5, to: A },
  },
  {
    label: 'Over the auto ceiling → approval',
    note: 'Allowed, but material-risk: pauses for human approval, even in YOLO.',
    policy: { maxNativeMnt: 5, autoMaxNativeMnt: 0.1, autonomy: 'auto' },
    action: { kind: 'transfer', asset: 'CSPR', amountMnt: 1, to: A },
  },
  {
    label: 'Over the hard cap → blocked',
    note: 'Exceeds the per-tx cap. Deterministic code blocks it; the model cannot override.',
    policy: { maxNativeMnt: 2, autoMaxNativeMnt: 0.1 },
    action: { kind: 'transfer', asset: 'CSPR', amountMnt: 5, to: A },
  },
  {
    label: 'Swap into a non-allowlisted token → blocked',
    note: 'The allowlist covers BOTH legs — you cannot swap an allowed token into an arbitrary one.',
    policy: { tokenAllowlist: [A] },
    action: { kind: 'swap', asset: A, toAsset: B, amountMnt: 1, slippageBps: 50 },
  },
  {
    label: 'Slippage over the cap → blocked',
    note: 'Swap slippage tolerance exceeds the policy maximum.',
    policy: { maxSlippageBps: 100 },
    action: { kind: 'swap', asset: 'CSPR', toAsset: A, amountMnt: 1, slippageBps: 300 },
  },
  {
    label: 'Read-only → everything blocked',
    note: 'A locked-down treasury. No writes at all.',
    policy: { readOnly: true },
    action: { kind: 'transfer', asset: 'CSPR', amountMnt: 0.01, to: A },
  },
]

export function PolicyPlayground() {
  const [policy, setPolicy] = useState<DemoPolicy>(PRESETS[1].policy)
  const [action, setAction] = useState<DemoAction>(PRESETS[1].action)

  const verdict = useMemo(() => evaluateDemoPolicy(action, policy), [action, policy])

  const tone = !verdict.allowed
    ? { label: 'BLOCKED', cls: 'text-red-700 border-red-300 bg-red-50' }
    : verdict.requiresApproval
      ? { label: 'NEEDS APPROVAL', cls: 'text-amber-700 border-amber-300 bg-amber-50' }
      : { label: 'AUTO-EXECUTE', cls: 'text-emerald-700 border-emerald-300 bg-emerald-50' }

  const num = (v: number | null | undefined) => (v == null ? '' : String(v))
  const setP = (p: Partial<DemoPolicy>) => setPolicy(prev => ({ ...prev, ...p }))
  const setAct = (a: Partial<DemoAction>) => setAction(prev => ({ ...prev, ...a }))

  const field = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-paper)] px-2.5 py-1.5 text-sm'
  const label = 'block text-xs font-medium text-[var(--color-ink-2)] mb-1'

  return (
    <section className="mx-auto max-w-5xl px-5 py-16">
      <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl text-[var(--color-ink)]">
        Policy playground
      </h1>
      <p className="mt-3 max-w-2xl text-[var(--color-ink-2)]">
        Nebula&apos;s safety boundary is deterministic code, not a prompt. Configure the fund-control
        policy and a proposed action below; the verdict is computed by the same pure function that
        guards the agent on-chain. The model proposes, this disposes.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <button
            type="button"
            key={p.label}
            onClick={() => {
              setPolicy(p.policy)
              setAction(p.action)
            }}
            className="rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-xs hover:bg-[var(--color-cream-deep)] transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* Policy */}
        <div className="rounded-xl border border-[var(--color-border)] p-5 bg-[var(--color-cream-deep)]">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">
            Policy (NEBULA_POLICY_*)
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <span className={label}>Hard cap (CSPR/tx)</span>
              <input
                className={field}
                type="number"
                value={num(policy.maxNativeMnt)}
                placeholder="none"
                onChange={e => setP({ maxNativeMnt: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <span className={label}>Auto ceiling (CSPR)</span>
              <input
                className={field}
                type="number"
                value={num(policy.autoMaxNativeMnt)}
                placeholder="none"
                onChange={e =>
                  setP({ autoMaxNativeMnt: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </div>
            <div>
              <span className={label}>Max slippage (bps)</span>
              <input
                className={field}
                type="number"
                value={num(policy.maxSlippageBps)}
                placeholder="none"
                onChange={e =>
                  setP({ maxSlippageBps: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </div>
            <div>
              <span className={label}>Autonomy</span>
              <select
                className={field}
                value={policy.autonomy ?? 'auto'}
                onChange={e => setP({ autonomy: e.target.value as Autonomy })}
              >
                <option value="auto">auto</option>
                <option value="confirm">confirm (always ask)</option>
                <option value="readonly">readonly</option>
              </select>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                id="ro"
                type="checkbox"
                checked={policy.readOnly ?? false}
                onChange={e => setP({ readOnly: e.target.checked })}
              />
              <label htmlFor="ro" className="text-sm text-[var(--color-ink-2)]">
                read-only (block all writes)
              </label>
            </div>
            <div className="col-span-2">
              <span className={label}>Token allowlist (comma-separated; empty = any)</span>
              <input
                className={field}
                value={(policy.tokenAllowlist ?? []).join(', ')}
                placeholder="any token"
                onChange={e =>
                  setP({
                    tokenAllowlist: e.target.value
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <div className="col-span-2">
              <span className={label}>Recipient allowlist (empty = any)</span>
              <input
                className={field}
                value={(policy.recipientAllowlist ?? []).join(', ')}
                placeholder="any recipient"
                onChange={e =>
                  setP({
                    recipientAllowlist: e.target.value
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="rounded-xl border border-[var(--color-border)] p-5 bg-[var(--color-cream-deep)]">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">
            Proposed action
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <span className={label}>Kind</span>
              <select
                className={field}
                value={action.kind}
                onChange={e => setAct({ kind: e.target.value as 'transfer' | 'swap' })}
              >
                <option value="transfer">transfer</option>
                <option value="swap">swap</option>
              </select>
            </div>
            <div>
              <span className={label}>Amount (CSPR)</span>
              <input
                className={field}
                type="number"
                value={action.amountMnt}
                onChange={e => setAct({ amountMnt: Number(e.target.value) })}
              />
            </div>
            <div>
              <span className={label}>{action.kind === 'swap' ? 'Input asset' : 'Asset'}</span>
              <input
                className={field}
                value={action.asset}
                onChange={e => setAct({ asset: e.target.value })}
              />
            </div>
            {action.kind === 'swap' ? (
              <>
                <div>
                  <span className={label}>Output asset</span>
                  <input
                    className={field}
                    value={action.toAsset ?? ''}
                    onChange={e => setAct({ toAsset: e.target.value })}
                  />
                </div>
                <div>
                  <span className={label}>Slippage (bps)</span>
                  <input
                    className={field}
                    type="number"
                    value={num(action.slippageBps)}
                    onChange={e =>
                      setAct({ slippageBps: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                  />
                </div>
              </>
            ) : (
              <div className="col-span-2">
                <span className={label}>Recipient</span>
                <input
                  className={field}
                  value={action.to ?? ''}
                  onChange={e => setAct({ to: e.target.value })}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Verdict */}
      <div className={`mt-8 rounded-xl border p-5 ${tone.cls}`}>
        <div className="flex items-center justify-between">
          <span className="font-[family-name:var(--font-display)] text-2xl">{tone.label}</span>
          <span className="text-xs uppercase tracking-wide opacity-70">deterministic verdict</span>
        </div>
        {verdict.violations.length > 0 ? (
          <ul className="mt-3 list-disc pl-5 text-sm">
            {verdict.violations.map(v => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        ) : verdict.requiresApproval ? (
          <p className="mt-3 text-sm">
            Permitted, but material-risk — the agent pauses and asks for human approval before it
            broadcasts, even under YOLO. The deterministic floor sits beneath the session mode.
          </p>
        ) : (
          <p className="mt-3 text-sm">
            Within every limit — the agent executes (after a pre-flight simulation) and returns an
            auditable decision receipt.
          </p>
        )}
      </div>
    </section>
  )
}
