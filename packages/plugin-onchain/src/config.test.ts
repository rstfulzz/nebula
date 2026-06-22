import { describe, it, expect } from 'bun:test'
import {
  csprToMotes,
  motesToCspr,
  casperConfigFromEnv,
  CASPER_NETWORKS,
  MOTES_PER_CSPR,
} from './config'

describe('motes <-> CSPR', () => {
  it('1 CSPR = 1e9 motes', () => {
    expect(csprToMotes(1)).toBe(1_000_000_000n)
    expect(MOTES_PER_CSPR).toBe(1_000_000_000n)
  })
  it('handles 2.5 CSPR', () => {
    expect(csprToMotes(2.5)).toBe(2_500_000_000n)
  })
  it('handles the 500 CSPR delegation minimum', () => {
    expect(csprToMotes(500)).toBe(500_000_000_000n)
  })
  it('accepts a string amount', () => {
    expect(csprToMotes('500')).toBe(500_000_000_000n)
  })
  it('roundtrips', () => {
    expect(motesToCspr(csprToMotes(2.5))).toBe(2.5)
    expect(motesToCspr(5_000_000_000n)).toBe(5)
  })
})

describe('casperConfigFromEnv', () => {
  it('maps the mainnet chain name', () => {
    const prev = process.env.CASPER_CHAIN_NAME
    process.env.CASPER_CHAIN_NAME = 'casper'
    try {
      expect(casperConfigFromEnv().network).toBe('casper-mainnet')
    } finally {
      if (prev === undefined) delete process.env.CASPER_CHAIN_NAME
      else process.env.CASPER_CHAIN_NAME = prev
    }
  })

  it('defaults to testnet for any non-mainnet chain name', () => {
    const prev = process.env.CASPER_CHAIN_NAME
    process.env.CASPER_CHAIN_NAME = 'casper-test'
    try {
      expect(casperConfigFromEnv().network).toBe('casper-testnet')
    } finally {
      if (prev === undefined) delete process.env.CASPER_CHAIN_NAME
      else process.env.CASPER_CHAIN_NAME = prev
    }
  })

  it('the static network table is well-formed', () => {
    expect(CASPER_NETWORKS['casper-testnet'].chainName).toBe('casper-test')
    expect(CASPER_NETWORKS['casper-mainnet'].chainName).toBe('casper')
  })
})
