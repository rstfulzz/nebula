/**
 * x402 self-funding hero band — the LEAD section of the landing page.
 *
 * Server component: reads live Casper Testnet state through `readSelfFunding`
 * (server-only). It leads the home page with Nebula's differentiator — an agent
 * that funds its own operations by earning behind an x402 paywall and compounding
 * the proceeds into staking — with the real on-chain numbers as proof.
 */
import Link from 'next/link'
import { ACTIVE_NETWORK } from '@/lib/chain/chain'
import { NEBULA_AGENT_PUBLIC_KEY, readSelfFunding } from '@/lib/self-funding'

// The proven x402 settlement transaction (the agent earning behind the paywall).
const SETTLEMENT_TX = '07747714d43e65a98aafe9a30544a8c795eb185179d7242847a683d5b6c05736'

const fmt = (n: number, max = 2) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: max }).format(n)

function txUrl(hash: string): string {
  return `${ACTIVE_NETWORK.explorer}/transaction/${hash}`
}
function accountUrl(pub: string): string {
  return `${ACTIVE_NETWORK.explorer}/account/${pub}`
}

export async function X402Hero() {
  const { revenue, exchange, stake } = await readSelfFunding()
  const allLive = revenue.live && exchange.live && stake.live

  return (
    <section
      id="x402"
      aria-labelledby="x402-headline"
      className="relative isolate bg-[var(--color-cream)]"
    >
      <div className="mx-auto w-full max-w-[var(--container-wrap)] px-6 pb-16 pt-28 sm:px-8 sm:pb-20 md:pt-32">
        {/* Kicker */}
        <div className="flex items-center gap-2.5">
          <LiveDot live={allLive} />
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-3)]">
            x402 · Live on Casper Testnet
          </span>
        </div>

        {/* Thesis headline */}
        <h1
          id="x402-headline"
          className="mt-5 max-w-[18ch] font-display text-[clamp(40px,5.6vw,76px)] font-light leading-[1.02] tracking-[-0.022em] text-[var(--color-ink)]"
          style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30, "WONK" 0' }}
        >
          An agent that funds its own operations.
        </h1>
        <p className="mt-6 max-w-[58ch] text-[clamp(16px,1.5vw,19px)] leading-relaxed text-[var(--color-ink-2)]">
          Nebula earns behind an{' '}
          <span className="font-medium text-[var(--color-ink)]">x402</span> paywall and compounds
          the proceeds into staking — on Casper. No human tops up the wallet. The loop pays for
          itself.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-7 py-3.5 text-[15px] font-medium tracking-tight text-[var(--color-cream)] shadow-[0_18px_40px_-22px_rgba(16,15,9,0.7)] transition-transform hover:-translate-y-0.5 hover:scale-[1.01] active:scale-[0.99]"
          >
            <span>See it live</span>
            <span aria-hidden className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
          <a
            href={txUrl(SETTLEMENT_TX)}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink-2)]"
          >
            <span>View the proven settlement tx</span>
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              ↗
            </span>
          </a>
        </div>

        {/* The loop, visual */}
        <LoopFlow />

        {/* Live proof */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ProofStat
            label="x402 revenue"
            value={fmt(revenue.csprpay)}
            unit="CSPRPAY"
            sub="Earned behind the paywall"
            live={revenue.live}
          />
          <ProofStat
            label="Exchange reserve"
            value={fmt(exchange.reserveCspr)}
            unit="CSPR"
            sub={`${fmt(exchange.redeemedTotalCspr)} CSPR redeemed`}
            live={exchange.live}
          />
          <ProofStat
            label="CSPR staked"
            value={fmt(stake.delegatedCspr)}
            unit="CSPR"
            sub="Delegated · compounding"
            live={stake.live}
          />
        </div>

        {/* x402 framing */}
        <p className="mt-6 max-w-[62ch] text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">
          <span className="font-mono uppercase tracking-[0.12em] text-[var(--color-ink-2)]">
            x402
          </span>{' '}
          — the hosted facilitator settles each payment and pays the Casper gas (non-custodial), so
          the buyer needs <span className="font-medium text-[var(--color-ink-2)]">0 CSPR</span> to
          pay. Every figure above is read live from{' '}
          <a
            href={accountUrl(NEBULA_AGENT_PUBLIC_KEY)}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--color-border-strong)] underline-offset-2 transition-colors hover:text-[var(--color-ink-2)]"
          >
            Nebula's account
          </a>
          .
        </p>
      </div>
    </section>
  )
}

// ─── pieces ──────────────────────────────────────────────────────────────

function LoopFlow() {
  const steps = [
    { n: '1', label: 'Earn', detail: 'x402 paywall → CSPRPAY' },
    { n: '2', label: 'Redeem', detail: 'CSPRPAY → CSPR' },
    { n: '3', label: 'Stake', detail: 'Delegate · compound' },
  ]
  return (
    <div className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-paper)] px-5 py-5 shadow-[var(--shadow-card)] sm:px-7 sm:py-6">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        {steps.map((s, i) => (
          <div key={s.n} className="flex flex-1 items-center gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] font-mono text-[12px] font-medium text-[var(--color-cream)]">
                {s.n}
              </span>
              <div>
                <div className="text-[15px] font-medium text-[var(--color-ink)]">{s.label}</div>
                <div className="font-mono text-[11px] text-[var(--color-ink-3)]">{s.detail}</div>
              </div>
            </div>
            {i < steps.length - 1 ? (
              <span
                className="hidden flex-1 text-center text-[20px] text-[var(--color-ink-3)] sm:block"
                aria-hidden
              >
                →
              </span>
            ) : (
              <span
                className="ml-auto hidden text-[20px] text-[var(--color-ink-3)] sm:block"
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

function ProofStat({
  label,
  value,
  unit,
  sub,
  live,
}: {
  label: string
  value: string
  unit: string
  sub: string
  live: boolean
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-paper)] p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-ink-3)]">
          {label}
        </span>
        <LiveDot live={live} small />
      </div>
      <div className="mt-3 font-display text-[clamp(26px,3vw,34px)] font-light leading-none tracking-[-0.01em] text-[var(--color-ink)]">
        {value} <span className="text-[14px] font-normal text-[var(--color-ink-3)]">{unit}</span>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">{sub}</p>
    </div>
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
