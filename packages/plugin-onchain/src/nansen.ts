/**
 * Nansen address-intelligence (read-only). Returns the entity labels Nansen
 * has for an address — exchange / fund / smart-money / contract / and red-flag
 * categories (scam, hack, sanctioned, mixer) — so the agent can vet a
 * counterparty before transacting. Fits the "unified risk analysis" thesis.
 *
 * Auth: `apiKey` header (NANSEN_API_KEY, env only — never committed). Endpoints
 * are credit-metered on Nansen's side; the tool surfaces a clear message when
 * the key is unset or out of credits rather than failing hard.
 */

export const NANSEN_BASE = 'https://api.nansen.ai/api/v1'

/** Label categories that should raise a counterparty flag. */
const RED_FLAG_CATEGORIES = ['scam', 'hack', 'exploit', 'sanctioned', 'mixer', 'phish', 'fraud']

export interface NansenLabel {
  label: string
  category: string
}

export interface NansenLabelsResult {
  ok: boolean
  /** Set when the call failed (missing key, no credits, HTTP error). */
  error?: string
  labels: NansenLabel[]
}

export async function fetchNansenLabels(opts: {
  address: string
  chain: string
  apiKey: string
  fetchImpl?: typeof fetch
}): Promise<NansenLabelsResult> {
  const { address, chain, apiKey, fetchImpl } = opts
  const f = fetchImpl ?? fetch
  let res: Response
  try {
    res = await f(`${NANSEN_BASE}/profiler/address/labels`, {
      method: 'POST',
      headers: { apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, chain }),
    })
  } catch (e) {
    return {
      ok: false,
      error: `Nansen request failed: ${(e as Error).message.slice(0, 120)}`,
      labels: [],
    }
  }
  if (res.status === 403) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    return {
      ok: false,
      error: j.error ?? 'Nansen 403 (out of credits or unauthorized)',
      labels: [],
    }
  }
  if (!res.ok) return { ok: false, error: `Nansen API ${res.status}`, labels: [] }
  const j = (await res.json().catch(() => ({}))) as {
    data?: Array<{ label?: string; category?: string }>
  }
  const labels = (j.data ?? []).map(l => ({
    label: l.label ?? '?',
    category: l.category ?? 'unknown',
  }))
  return { ok: true, labels }
}

/** Red-flag category names present in a label set (for a counterparty warning). */
export function redFlags(labels: NansenLabel[]): string[] {
  const cats = new Set<string>()
  for (const l of labels) {
    const c = l.category.toLowerCase()
    if (RED_FLAG_CATEGORIES.some(rf => c.includes(rf))) cats.add(l.category)
  }
  return [...cats]
}

/** Distinct label categories, with counts, for a compact summary. */
export function categorySummary(labels: NansenLabel[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of labels) out[l.category] = (out[l.category] ?? 0) + 1
  return out
}
