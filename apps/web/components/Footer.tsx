import Link from 'next/link'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const PROJECT_LINKS = [
  { label: 'GitHub', href: 'https://github.com/rstfulzz/nebula', external: true },
  { label: 'README', href: 'https://github.com/rstfulzz/nebula#readme', external: true },
  { label: 'Releases', href: 'https://github.com/rstfulzz/nebula/releases', external: true },
]

const COMMUNITY_LINKS = [
  { label: '@nebulaai_space', href: 'https://x.com/nebulaai_space', external: true },
]

const ON_MANTLE: Array<{ name: string; href: string; label: string }> = [
  { name: 'Mantle', href: 'https://mantle.xyz', label: 'execution + settlement · MNT' },
  { name: 'Agni Finance', href: 'https://agni.finance', label: 'trading · swap.execute' },
  { name: 'Aave V3', href: 'https://aave.com', label: 'lending · aave.supply / withdraw' },
  { name: 'DeFiLlama', href: 'https://defillama.com', label: 'yield discovery · read-only' },
]

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-[var(--color-border)] bg-[var(--color-cream)]">
      <div className="mx-auto w-full max-w-[var(--container-wrap)] px-6 pt-20 pb-6 sm:px-8">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12">
          <div className="md:col-span-3">
            <Link
              href="/"
              className="font-wordmark text-[44px] leading-none tracking-[-0.02em] text-[var(--color-ink)]"
            >
              nebula
            </Link>
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-[var(--color-ink-2)]">
              A policy-aware AI treasury assistant on Mantle. The AI advises; deterministic code
              enforces the fund controls.
            </p>
          </div>

          <FooterColumn label="PROJECT">
            {PROJECT_LINKS.map(link => (
              <FooterRow key={link.label} href={link.href} external={link.external}>
                {link.label} <span aria-hidden>↗</span>
              </FooterRow>
            ))}
          </FooterColumn>

          <FooterColumn label="ON MANTLE" className="md:col-span-3">
            {ON_MANTLE.map(item => (
              <a
                key={item.name}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="group block py-1 transition"
              >
                <div className="flex items-baseline justify-between gap-3 text-[14px] text-[var(--color-ink)] transition group-hover:text-[var(--color-ink-2)]">
                  <span>{item.name}</span>
                  <span aria-hidden className="opacity-50 group-hover:opacity-100">↗</span>
                </div>
                <div className="font-mono text-[11.5px] tracking-tight text-[var(--color-ink-3)] transition group-hover:text-[var(--color-ink-2)]">
                  {item.label}
                </div>
              </a>
            ))}
          </FooterColumn>

          <FooterColumn label="COMMUNITY">
            {COMMUNITY_LINKS.map(link => (
              <FooterRow key={link.label} href={link.href} external={link.external}>
                {link.label} <span aria-hidden>↗</span>
              </FooterRow>
            ))}
          </FooterColumn>
        </div>

        <div className="mt-10 flex flex-col gap-6 border-t border-[var(--color-border)] pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="font-mono text-[12px] text-[var(--color-ink-3)]">
            © 2026 · Built by nebula
          </div>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`md:col-span-2 ${className}`}>
      <div className="font-mono mb-4 text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
        {label}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function FooterRow({
  href,
  external,
  children,
}: {
  href: string
  external?: boolean
  children: React.ReactNode
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 py-0.5 text-[14px] text-[var(--color-ink)] transition hover:text-[var(--color-ink-2)]"
      >
        {children}
      </a>
    )
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 py-0.5 text-[14px] text-[var(--color-ink)] transition hover:text-[var(--color-ink-2)]"
    >
      {children}
    </Link>
  )
}
