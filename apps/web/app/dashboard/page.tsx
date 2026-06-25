import { Footer } from '@/components/Footer'
import { SubNavbar } from '@/components/SubNavbar'
import { ACTIVE_NETWORK } from '@/lib/chain/chain'
import {
  type ActivityItem,
  NEBULA_AGENT_PUBLIC_KEY,
  NEBULA_VALIDATOR,
  readSelfFunding,
} from '@/lib/self-funding'

export const metadata = {
  title: 'Self-funding · nebula',
  description:
    'Nebula — an agent that funds its own operations. Live on Casper Testnet: x402 revenue, redemption, and compounding stake.',
}

// Always read fresh on-chain state; never cache the demo numbers.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const EXPLORER = ACTIVE_NETWORK.explorer

function txUrl(hash: string): string {
  return `${EXPLORER}/transaction/${hash}`
}
function accountUrl(pub: string): string {
  return `${EXPLORER}/account/${pub}`
}
function validatorUrl(pub: string): string {
  return `${EXPLORER}/validator/${pub}`
}

const fmt = (n: number, max = 2) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: max }).format(n)

function short(s: string, head = 6, tail = 4) {
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`
}

export default async function DashboardPage() {
  const { revenue, exchange, stake, activity } = await readSelfFunding()
  const allLive = revenue.live && exchange.live && stake.live
  const totalSecured = stake.delegatedCspr + stake.liquidCspr

  return (
    <main className="relative min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)]">
      <SubNavbar label="self-funding" />
      <div className="mx-auto w-full max-w-[var(--container-wrap)] px-6 pb-24 pt-28 sm:px-8 md:pt-32">
        {/* Header */}
        <header className="flex flex-col gap-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-3)]">
            Live · Casper Testnet
          </span>
          <h1
            className="font-display text-[clamp(34px,4.6vw,58px)] font-light leading-[1.05] tracking-[-0.018em] text-[var(--color-ink)]"
            style={{ fontVariationSettings: '"opsz" 84, "SOFT" 24' }}
          >
            An agent that funds its own operations.
          </h1>
          <p className="max-w-[64ch] text-[16px] leading-relaxed text-[var(--color-ink-2)]">
            Nebula earns CSPRPAY from agent-to-agent micropayments (x402), redeems it for native
            CSPR at its on-chain exchange, then stakes the proceeds to compound. No human tops up the
            wallet — the loop pays for itself. Every figure below is read live from{' '}
            <a
              href={accountUrl(NEBULA_AGENT_PUBLIC_KEY)}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-[var(--color-border-strong)] underline-offset-2 hover:text-[var(--color-ink)]"
            >
              Nebula's account
            </a>
            .
          </p>
          <div className="mt-1 flex items-center gap-2">
            <LiveDot live={allLive} />
            <span className="font-mono text-[11.5px] text-[var(--color-ink-3)]">
              {allLive
                ? 'All cards reading live on-chain state'
                : 'Some cards on last-proven values (chain read unavailable)'}
            </span>
          </div>
        </header>

        {/* The loop */}
        <LoopFlow />

        {/* Cards */}
        <section className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card
            step="01"
            title="x402 Revenue"
            live={revenue.live}
            value={`${fmt(revenue.csprpay)} CSPRPAY`}
            sub="Earned from agent micropayments — Nebula's CSPRPAY balance."
            foot={
              <FootLink href={txUrl(activity.find((a) => a.kind === 'earn')?.hash ?? '')}>
                View an x402 settlement →
              </FootLink>
            }
          />
          <Card
            step="02"
            title="PayExchange"
            live={exchange.live}
            value={`${fmt(exchange.reserveCspr)} CSPR`}
            sub={`Reserve backing redemptions · ${fmt(exchange.redeemedTotalCspr)} CSPR redeemed so far.`}
            foot={
              <FootLink href={txUrl(activity.find((a) => a.kind === 'redeem')?.hash ?? '')}>
                View a redemption →
              </FootLink>
            }
          />
          <Card
            step="03"
            title="Stake (compounding)"
            live={stake.live}
            value={`${fmt(stake.delegatedCspr)} CSPR`}
            sub={`Delegated to ${short(stake.validator)} · ${fmt(stake.liquidCspr)} CSPR liquid.`}
            foot={
              <FootLink href={validatorUrl(NEBULA_VALIDATOR)}>View the validator →</FootLink>
            }
          />
        </section>

        {/* Totals strip */}
        <section className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="CSPRPAY earned" value={fmt(revenue.csprpay)} unit="CSPRPAY" />
          <Stat label="CSPR redeemed" value={fmt(exchange.redeemedTotalCspr)} unit="CSPR" />
          <Stat label="CSPR staked" value={fmt(stake.delegatedCspr)} unit="CSPR" />
          <Stat label="CSPR under agent" value={fmt(totalSecured)} unit="CSPR" />
        </section>

        {/* Activity */}
        <section className="mt-12">
          <h2 className="font-display text-[22px] font-light tracking-[-0.01em] text-[var(--color-ink)]">
            Proven on-chain activity
          </h2>
          <p className="mt-1 text-[14px] text-[var(--color-ink-2)]">
            Each link opens the transaction on cspr.live — the full loop, verifiable.
          </p>
          <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-paper)]">
            {activity.map((a, i) => (
              <ActivityRow key={a.hash} item={a} first={i === 0} />
            ))}
          </div>
        </section>
      </div>
      <Footer />
    </main>
  )
}

// ─── pieces ──────────────────────────────────────────────────────────────

function LoopFlow() {
  const steps = [
    { n: '1', label: 'Earn', detail: 'x402 micropayments → CSPRPAY' },
    { n: '2', label: 'Redeem', detail: 'CSPRPAY → CSPR at the exchange' },
    { n: '3', label: 'Stake', detail: 'Delegate CSPR · compound' },
  ]
  return (
    <div className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-paper)] px-5 py-5 sm:px-7">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        {steps.map((s, i) => (
          <div key={s.n} className="flex flex-1 items-center gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] font-mono text-[12px] font-medium text-[var(--color-cream)]">
                {s.n}
              </span>
              <div>
                <div className="text-[14px] font-medium text-[var(--color-ink)]">{s.label}</div>
                <div className="font-mono text-[11px] text-[var(--color-ink-3)]">{s.detail}</div>
              </div>
            </div>
            {i < steps.length - 1 ? (
              <span className="hidden flex-1 text-center text-[18px] text-[var(--color-ink-3)] sm:block">
                →
              </span>
            ) : (
              <span
                className="ml-auto hidden text-[18px] text-[var(--color-ink-3)] sm:block"
                aria-hidden
                title="and back to earning"
              >
                ↺
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Card({
  step,
  title,
  value,
  sub,
  foot,
  live,
}: {
  step: string
  title: string
  value: string
  sub: string
  foot: React.ReactNode
  live: boolean
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-paper)] p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
          {step} · {title}
        </span>
        <LiveDot live={live} small />
      </div>
      <div className="mt-4 font-display text-[clamp(26px,3vw,34px)] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
        {value}
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">{sub}</p>
      <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-[12.5px]">{foot}</div>
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-paper)] px-4 py-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-ink-3)]">
        {label}
      </div>
      <div className="mt-1.5 text-[19px] font-medium text-[var(--color-ink)]">
        {value} <span className="text-[12px] font-normal text-[var(--color-ink-3)]">{unit}</span>
      </div>
    </div>
  )
}

const KIND_COLOR: Record<ActivityItem['kind'], string> = {
  earn: '#2e9e6b',
  redeem: '#d99a2b',
  stake: '#4f7ad9',
  seed: '#8b8b88',
}

function ActivityRow({ item, first }: { item: ActivityItem; first: boolean }) {
  return (
    <a
      href={txUrl(item.hash)}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-[var(--color-cream-deep)] ${
        first ? '' : 'border-t border-[var(--color-border)]'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: KIND_COLOR[item.kind] }}
        />
        <div>
          <div className="text-[14px] text-[var(--color-ink)]">{item.label}</div>
          <div className="text-[12px] text-[var(--color-ink-2)]">{item.detail}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden font-mono text-[11.5px] text-[var(--color-ink-3)] sm:inline">
          {short(item.hash, 8, 6)}
        </span>
        <span className="text-[var(--color-ink-3)]" aria-hidden>
          ↗
        </span>
      </div>
    </a>
  )
}

function FootLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
    >
      {children}
    </a>
  )
}

function LiveDot({ live, small }: { live: boolean; small?: boolean }) {
  const size = small ? 7 : 9
  const color = live ? '#2e9e6b' : '#d99a2b'
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      {live ? (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ backgroundColor: color }}
        />
      ) : null}
      <span
        className="relative inline-flex rounded-full"
        style={{ width: size, height: size, backgroundColor: color }}
      />
    </span>
  )
}
