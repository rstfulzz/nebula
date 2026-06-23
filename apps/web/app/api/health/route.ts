import { ACTIVE_NETWORK, casperMainnet, casperTestnet } from '@/lib/chain/chain'
import { HttpHandler, RpcClient } from 'casper-js-sdk'
import { NextResponse } from 'next/server'

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

// Live RPC ping — proves the Casper node endpoint answers, and how fast.
async function pingChain(id: string, name: string, rpcUrl: string): Promise<Service> {
  const rpc = new RpcClient(new HttpHandler(rpcUrl))
  const started = Date.now()
  try {
    const result = await withTimeout(rpc.getLatestBlock(), 4000)
    const ms = Date.now() - started
    const height = result.block?.height ?? 0
    return {
      id,
      name,
      status: ms > 2500 ? 'degraded' : 'operational',
      detail: `block ${height} · ${ms}ms`,
    }
  } catch {
    return { id, name, status: 'down', detail: 'RPC unreachable' }
  }
}

export async function GET() {
  // Ping the active network, plus the other network (so testnet builds still
  // surface a mainnet signal and vice-versa).
  const otherRpc =
    ACTIVE_NETWORK.chainName === casperTestnet.chainName
      ? casperMainnet.rpcUrl
      : casperTestnet.rpcUrl

  const [active, registries] = await Promise.all([
    pingChain('casper', `${ACTIVE_NETWORK.name} node`, ACTIVE_NETWORK.rpcUrl),
    pingChain('registries', 'Casper agent registries node', otherRpc),
  ])

  const services: Service[] = [
    { id: 'web', name: 'Web console', status: 'operational', detail: 'nebulaai.space' },
    { id: 'api', name: 'Chat & agent API', status: 'operational', detail: 'responding' },
    active,
    registries,
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
