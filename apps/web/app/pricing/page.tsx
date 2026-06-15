import { Footer } from '@/components/Footer'
import Link from 'next/link'
import { Fragment } from 'react'

export const metadata = {
  title: 'Pricing · nebula',
  description:
    'Plans for nebula, the policy-aware AI treasury agent on Mantle. Start free, bring your own LLM key, and pay only for execution. Subscriptions are coming soon.',
}

type Cta = { label: string; href?: string; soon: boolean }
type Plan = {
  id: string
  name: string
  price: string
  period: string
  tagline: string
  highlight?: boolean
  cta: Cta
  bullets: string[]
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    tagline: 'Self-serve. Bring your own LLM key.',
    cta: { label: 'Open console', href: '/console', soon: false },
    bullets: ['Unlimited reads & simulation', 'Manual signing', 'CLI · console · SDK'],
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '$19',
    period: '/ month',
    tagline: 'For individuals running a live treasury.',
    highlight: true,
    cta: { label: 'Coming soon', soon: true },
    bullets: ['Bundled frontier model', 'Agent wallet + light autonomy', 'Telegram bot'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    period: '/ month',
    tagline: 'Power users and active on-chain traders.',
    cta: { label: 'Coming soon', soon: true },
    bullets: ['5× the usage ceiling', 'Full 24/7 autonomy', 'Multi-agent + audit log'],
  },
  {
    id: 'team',
    name: 'Team',
    price: '$49',
    period: '/ seat · mo',
    tagline: 'DAOs and multisig treasuries.',
    cta: { label: 'Coming soon', soon: true },
    bullets: ['Multisig policy & approvals', 'Seats, SSO & roles', 'Lowest execution fee'],
  },
]

type Row = { label: string; values: Array<string | boolean> }
type Group = { name: string; rows: Row[] }

// Column order matches PLANS: Free · Plus · Pro · Team
const FEATURE_GROUPS: Group[] = [
  {
    name: 'Intelligence',
    rows: [
      {
        label: 'Chat, portfolio & yield reads',
        values: ['Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'],
      },
      {
        label: 'AI model',
        values: ['Standard', 'Frontier', 'Frontier + priority', 'Frontier + priority'],
      },
      { label: 'Agent runs', values: ['25 / day', '~1,500 / mo', '5× Plus', '20× Plus'] },
      { label: 'Bring your own LLM key', values: [true, true, true, true] },
    ],
  },
  {
    name: 'Execution',
    rows: [
      { label: 'Transaction simulation', values: [true, true, true, true] },
      { label: 'Policy controls & approvals', values: [true, true, true, '+ multisig'] },
      { label: 'Derived agent wallet', values: [true, true, true, true] },
      { label: '24/7 autonomy (gateway)', values: [false, 'Light', 'Full', 'Full'] },
      { label: 'Swap / routing fee', values: ['0.30%', '0.20%', '0.15%', '0.10%'] },
    ],
  },
  {
    name: 'Surfaces & teams',
    rows: [
      { label: 'Web console + CLI + SDK', values: [true, true, true, true] },
      { label: 'Telegram bot', values: [false, true, true, true] },
      { label: 'Multi-agent', values: [false, false, true, true] },
      { label: 'Audit log & export', values: [false, false, true, true] },
      { label: 'Seats, SSO & roles', values: [false, false, false, true] },
      { label: 'Support', values: ['Community', 'Email', 'Priority', 'Dedicated'] },
    ],
  },
]

export default function PricingPage() {
  return (
    <main className="relative min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)]">
      <PricingNavbar />
      <div className="mx-auto w-full max-w-[var(--container-wrap)] px-6 pb-24 pt-28 sm:px-8 md:pt-32">
        <Header />
        <PlanCards />
        <ComparisonTable />
        <EnterpriseBand />
        <FeeNote />
      </div>
      <Footer />
    </main>
  )
}

function PricingNavbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-[var(--color-cream)]/85 backdrop-blur-md pt-5 sm:pt-6">
      <div className="mx-auto flex h-[56px] w-full max-w-[var(--container-wrap)] items-center justify-between px-6 sm:px-8">
        <Link
          href="/"
          className="font-wordmark text-[24px] leading-none tracking-[-0.02em] text-[var(--color-ink)]"
          aria-label="nebula home"
        >
          nebula<span className="text-[var(--color-ink-3)]"> · pricing</span>
        </Link>
        <nav className="flex items-center gap-5" aria-label="pricing">
          <Link
            href="/docs"
            className="hidden text-[14px] font-medium text-[var(--color-ink)] transition-colors hover:text-[var(--color-ink-2)] sm:inline"
          >
            Docs
          </Link>
          <Link
            href="/console"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-4 py-2 text-[13px] font-medium text-[var(--color-cream)] transition-transform hover:-translate-y-[1px]"
          >
            Open console <span aria-hidden>→</span>
          </Link>
        </nav>
      </div>
    </header>
  )
}

function Header() {
  return (
    <header className="flex flex-col items-start gap-5">
      <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-2)]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-ink-3)]" />
        Pricing preview · plans go live soon
      </span>
      <h1
        className="font-display text-[clamp(40px,5.5vw,76px)] font-light leading-[1.03] tracking-[-0.018em] text-[var(--color-ink)]"
        style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30, "WONK" 0' }}
      >
        Start free.
        <br />
        Pay for execution.
      </h1>
      <p className="max-w-[62ch] text-[16px] leading-relaxed text-[var(--color-ink-2)]">
        nebula is free to run today — bring your own LLM key and the agent reads, simulates, and
        signs from your own wallet. Subscriptions add bundled intelligence, autonomy, and lower
        on-chain fees. They&rsquo;re on the way.
      </p>
    </header>
  )
}

function PlanCards() {
  return (
    <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {PLANS.map(plan => (
        <div
          key={plan.id}
          className={`relative flex flex-col rounded-2xl border p-6 ${
            plan.highlight
              ? 'border-[var(--color-border-strong)] bg-[var(--color-paper)] shadow-[var(--shadow-card)]'
              : 'border-[var(--color-border)] bg-[var(--color-paper)]'
          }`}
        >
          {plan.highlight ? (
            <span className="absolute -top-2.5 left-6 rounded-full bg-[var(--color-ink)] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-cream)]">
              Most popular
            </span>
          ) : null}
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-3)]">
            {plan.name}
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span
              className="font-display text-[40px] font-light leading-none tracking-tight text-[var(--color-ink)]"
              style={{ fontVariationSettings: '"opsz" 96' }}
            >
              {plan.price}
            </span>
            <span className="text-[13px] text-[var(--color-ink-3)]">{plan.period}</span>
          </div>
          <p className="mt-3 min-h-[40px] text-[13.5px] leading-snug text-[var(--color-ink-2)]">
            {plan.tagline}
          </p>
          <div className="mt-5">
            <PlanCta plan={plan} />
          </div>
          <ul className="mt-6 flex flex-col gap-2.5 border-t border-[var(--color-border)] pt-5">
            {plan.bullets.map(b => (
              <li key={b} className="flex items-start gap-2 text-[13px] text-[var(--color-ink-2)]">
                <Check />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function PlanCta({ plan }: { plan: Plan }) {
  if (!plan.cta.soon && plan.cta.href) {
    return (
      <Link
        href={plan.cta.href}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--color-ink)] px-4 py-2.5 text-[13.5px] font-medium text-[var(--color-cream)] transition-transform hover:-translate-y-[1px]"
      >
        {plan.cta.label} <span aria-hidden>→</span>
      </Link>
    )
  }
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="Subscriptions are coming soon"
      className="inline-flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-full border border-[var(--color-border-strong)] bg-transparent px-4 py-2.5 text-[13.5px] font-medium text-[var(--color-ink-3)]"
    >
      {plan.cta.label}
    </button>
  )
}

function ComparisonTable() {
  return (
    <section className="mt-24">
      <h2
        className="font-display text-[clamp(26px,3vw,38px)] font-light tracking-tight text-[var(--color-ink)]"
        style={{ fontVariationSettings: '"opsz" 72, "SOFT" 20' }}
      >
        Compare every plan
      </h2>
      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr>
              <th className="w-[34%] pb-4 align-bottom font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
                Features
              </th>
              {PLANS.map(plan => (
                <th
                  key={plan.id}
                  className={`pb-4 align-bottom ${plan.highlight ? 'rounded-t-xl bg-[var(--color-cream-deep)]' : ''}`}
                >
                  <div className="px-3">
                    <div className="text-[15px] font-semibold text-[var(--color-ink)]">
                      {plan.name}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-[var(--color-ink-3)]">
                      {plan.price}
                      <span className="text-[11px]"> {plan.period}</span>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_GROUPS.map(group => (
              <Fragment key={group.name}>
                <tr>
                  <td
                    colSpan={PLANS.length + 1}
                    className="border-t border-[var(--color-border-strong)] pt-6 pb-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-[var(--color-ink-2)]"
                  >
                    {group.name}
                  </td>
                </tr>
                {group.rows.map(row => (
                  <tr key={row.label} className="border-t border-[var(--color-border)]">
                    <td className="py-3 pr-4 text-[13.5px] text-[var(--color-ink-2)]">
                      {row.label}
                    </td>
                    {row.values.map((v, i) => (
                      <td
                        key={PLANS[i].id}
                        className={`px-3 py-3 text-center text-[13.5px] ${
                          PLANS[i].highlight ? 'bg-[var(--color-cream-deep)]' : ''
                        }`}
                      >
                        <Cell v={v} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr>
              <td className="pt-6" />
              {PLANS.map(plan => (
                <td
                  key={plan.id}
                  className={`px-3 pt-6 pb-5 text-center ${
                    plan.highlight ? 'rounded-b-xl bg-[var(--color-cream-deep)]' : ''
                  }`}
                >
                  <PlanCta plan={plan} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function EnterpriseBand() {
  return (
    <section className="mt-20 flex flex-col items-start justify-between gap-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-paper)] p-8 sm:flex-row sm:items-center">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-3)]">
          Enterprise · Managed
        </div>
        <h3
          className="mt-2 font-display text-[clamp(22px,2.6vw,30px)] font-light tracking-tight text-[var(--color-ink)]"
          style={{ fontVariationSettings: '"opsz" 72' }}
        >
          Custom terms for funds and large DAOs
        </h3>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          Seat + inference at cost, an AUM-based fee, optional performance fee, self-host or
          on-prem, dedicated policy review, and an SLA. ERC-8004-verifiable on-chain track record
          included.
        </p>
      </div>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Coming soon"
        className="shrink-0 cursor-not-allowed rounded-full border border-[var(--color-border-strong)] px-5 py-2.5 text-[13.5px] font-medium text-[var(--color-ink-3)]"
      >
        Talk to us · coming soon
      </button>
    </section>
  )
}

function FeeNote() {
  return (
    <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-4 border-t border-[var(--color-border)] pt-8 sm:grid-cols-2">
      <FeeItem title="Bring your own key">
        On every plan you can supply your own OpenAI / OpenRouter / Anthropic key, so inference is
        at cost — the subscription then covers autonomy, surfaces, and a lower execution fee.
      </FeeItem>
      <FeeItem title="Execution fee">
        A small fee on swaps the agent routes for you, tiered down as you upgrade. Reads,
        simulations, and transfers from your own wallet are never charged.
      </FeeItem>
      <FeeItem title="No custody">
        nebula never holds your funds. The agent proposes; policy gates; you (or your multisig)
        sign. Cancel anytime — your wallet and keys stay yours.
      </FeeItem>
      <FeeItem title="Preview pricing">
        Numbers here are indicative while plans are in preview and may change before launch. Today
        the Free tier is fully usable — open the console and connect a wallet.
      </FeeItem>
    </div>
  )
}

function FeeItem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[13.5px] font-semibold text-[var(--color-ink)]">{title}</div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-2)]">{children}</p>
    </div>
  )
}

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="mx-auto" />
  if (v === false) return <span className="text-[var(--color-ink-3)]">—</span>
  return <span className="text-[var(--color-ink)]">{v}</span>
}

function Check({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      role="img"
      aria-label="included"
      className={`h-3.5 w-3.5 shrink-0 text-[var(--color-ink)] ${className}`}
      fill="none"
    >
      <title>included</title>
      <path
        d="M3 8.5l3.2 3.2L13 4.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
