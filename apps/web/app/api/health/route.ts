import { mantleMainnet, mantleTestnet } from '@/lib/chain/chain'
import { NextResponse } from 'next/server'
import { type Chain, createPublicClient, http } from 'viem'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ServiceStatus = 'operational' | 'degraded' | 'down'
type Service = { id: string; name: string; status: ServiceStatus; detail: string }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    p.then(
      v => {
        clearTimeout(t)
        resolve(v)
      },
      e => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

// Live RPC ping — proves the chain endpoint answers, and how fast.
async function pingChain(id: string, name: string, chain: Chain): Promise<Service> {
  const client = createPublicClient({ chain, transport: http() })
  const started = Date.now()
  try {
    const block = await withTimeout(client.getBlockNumber(), 4000)
    const ms = Date.now() - started
    return {
      id,
      name,
      status: ms > 2500 ? 'degraded' : 'operational',
      detail: `block ${block.toString()} · ${ms}ms`,
    }
  } catch {
    return { id, name, status: 'down', detail: 'RPC unreachable' }
  }
}

export async function GET() {
  const [mantle, sepolia] = await Promise.all([
    pingChain('mantle', 'Mantle network', mantleMainnet),
    pingChain('erc8004', 'ERC-8004 registries (Mantle Sepolia)', mantleTestnet),
  ])

  const services: Service[] = [
    { id: 'web', name: 'Web console', status: 'operational', detail: 'nebulaai.space' },
    { id: 'api', name: 'Chat & agent API', status: 'operational', detail: 'responding' },
    mantle,
    sepolia,
  ]

  const overall: ServiceStatus = services.some(s => s.status === 'down')
    ? 'degraded'
    : services.some(s => s.status === 'degraded')
      ? 'degraded'
      : 'operational'

  return NextResponse.json(
    { status: overall, checkedAt: new Date().toISOString(), services },
    { headers: { 'cache-control': 'no-store' } },
  )
}
