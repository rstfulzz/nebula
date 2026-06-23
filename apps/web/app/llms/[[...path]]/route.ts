import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { NextRequest } from 'next/server'
import { type Doc, getDoc, listDocs, listSlugs } from '@/lib/docs'

export const runtime = 'nodejs'
export const dynamic = 'force-static'

export async function generateStaticParams() {
  const slugs = await listSlugs()
  return [
    { path: [] },
    { path: ['full'] },
    ...slugs.map(slug => ({ path: ['docs', slug] })),
  ]
}

const SITE_ORIGIN = 'https://nebula.xyz'
const REPO_BASE = 'https://github.com/rstfulzz/nebula/blob/main/'

const TEXT_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  'X-Nebula-Source': 'docs-llms',
}

const FULL_ORDER = [
  'agents',
  'quickstart',
  'configuration',
  'cli',
  'brain',
  'tools',
  'memory',
  'architecture',
  'identity',
  'console',
  'introduction',
]

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path: parts = [] } = await context.params

  if (parts.length === 0) {
    return text(await renderLlmsIndex())
  }
  if (parts.length === 1 && parts[0] === 'full') {
    return text(await renderLlmsFull())
  }
  if (parts.length === 2 && parts[0] === 'docs') {
    const body = await renderDocRaw(parts[1])
    if (body === null) return notFound()
    return text(body)
  }
  return notFound()
}

function text(body: string): Response {
  return new Response(body, { status: 200, headers: TEXT_HEADERS })
}

function notFound(): Response {
  return new Response('not found\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

async function renderLlmsIndex(): Promise<string> {
  const docs = await listDocs()
  const docBullets = docs
    .map(
      d =>
        `- [${d.frontmatter.title}](${SITE_ORIGIN}/docs/${d.frontmatter.slug}.md): ${d.frontmatter.description}`,
    )
    .join('\n')

  return `# nebula

> A Casper-native, policy-aware AI treasury agent. The AI advises; deterministic code enforces the fund controls. Nebula does real on-chain work on Casper (balances, transfers, staking, validators) from the terminal, Telegram, or a web console. Every value-moving action runs through a pipeline: policy (pure, unit-tested caps and allowlists) -> approval (material-risk actions prompt a human even under YOLO) -> execute (broadcast + on-chain verification).

## Install

bun is REQUIRED. Nebula is a Bun + Biome monorepo and the CLI runs on Bun.

\`\`\`
bun install
export OPENAI_API_KEY=sk-...
bun run nebula init
bun run nebula chat
\`\`\`

The brain is any OpenAI-compatible model (default \`gpt-4o-mini\`), swappable via \`NEBULA_LLM_BASE_URL\` and \`NEBULA_LLM_MODEL\`. The default identity is a plain Casper account (account hash / public key); there is no on-chain mint to start.

## For AI agents

The fund-control policy lives in \`NEBULA_POLICY_*\` environment variables (caps, allowlists, slippage, autonomy tier, read-only), not in the prompt. The model cannot raise a limit, skip a simulation, or grant its own approval; those decisions are deterministic code. Use Casper Testnet (\`casper-test\`) for exploratory work, then mainnet (\`casper\`). Full install model, anti-patterns, and the safety model: ${SITE_ORIGIN}/docs/agents.md

- Full single-file dump: ${SITE_ORIGIN}/llms-full.txt
- Per-page raw markdown: ${SITE_ORIGIN}/docs/<slug>.md (e.g. ${SITE_ORIGIN}/docs/quickstart.md)

## Docs

${docBullets}

## Reference

- README: https://github.com/rstfulzz/nebula#readme
- Console: ${SITE_ORIGIN}/console
- Releases: https://github.com/rstfulzz/nebula/releases
- Networks: mainnet \`casper\` (https://node.cspr.cloud/rpc, https://cspr.live), Testnet \`casper-test\` (https://node.testnet.cspr.cloud/rpc, https://testnet.cspr.live)
- Gas token: CSPR (1 CSPR = 1e9 motes)
- Earn: native staking/delegation. Swap: Friendly Market (Casper Testnet DEX). Contracts: Odra (Rust → Wasm) Identity/Reputation/Validation registries + a constant-product AMM.
`
}

async function renderLlmsFull(): Promise<string> {
  const [docs, readme] = await Promise.all([listDocs(), readReadme()])
  const docBySlug = new Map(docs.map(d => [d.frontmatter.slug, d]))

  const header = `# nebula — full machine-readable docs

> A Casper-native, policy-aware AI treasury agent. The AI advises; deterministic code enforces the fund controls. This file inlines every documentation page plus the repo README. Sections separated by horizontal rules. Each doc body is preceded by a source pointer when frontmatter declares one.

> Setup: Nebula is a Bun + Biome monorepo. Run \`bun install\`, set \`OPENAI_API_KEY\` (the brain is any OpenAI-compatible model, default \`gpt-4o-mini\`), then \`bun run nebula init\` and \`bun run nebula chat\`. The default identity is a plain EOA; no on-chain mint is required to start.

> Safety model: every value-moving action runs through policy (pure, unit-tested) -> simulate (dry-run) -> approval (material-risk prompts a human even under YOLO) -> execute (broadcast + receipt). The fund-control policy lives in \`NEBULA_POLICY_*\` environment variables, not in the prompt; the model cannot override it.

Binary name: \`nebula\` (run via \`bun run nebula\`). Engine: Bun.`

  const sections: string[] = [header]

  sections.push(`## README\n\n${sourceBlock('README.md')}${readme.trim()}`)

  const seen = new Set<string>()
  for (const slug of FULL_ORDER) {
    const d = docBySlug.get(slug)
    if (!d) continue
    sections.push(renderDocSection(d))
    seen.add(slug)
  }
  for (const d of docs) {
    if (seen.has(d.frontmatter.slug)) continue
    sections.push(renderDocSection(d))
  }

  return `${sections.join('\n\n---\n\n')}\n`
}

function sourceBlock(source: string | undefined): string {
  return source ? `> Source: ${REPO_BASE}${source}\n\n` : ''
}

function renderDocSection(d: Doc): string {
  return `## ${d.frontmatter.title}\n\n${sourceBlock(d.frontmatter.source)}${d.content.trim()}`
}

async function renderDocRaw(slug: string): Promise<string | null> {
  const doc = await getDoc(slug)
  if (!doc) return null
  return `${sourceBlock(doc.frontmatter.source)}${doc.content.trim()}`
}

async function readReadme(): Promise<string> {
  const readmePath = path.join(process.cwd(), '..', '..', 'README.md')
  try {
    return await fs.readFile(readmePath, 'utf8')
  } catch {
    return '# nebula\n\nREADME not bundled in this build. Read it at https://github.com/rstfulzz/nebula#readme'
  }
}
