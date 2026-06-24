import { describe, expect, it } from 'bun:test'
import { shortAddr } from './format'

describe('shortAddr', () => {
  it('returns ? for missing input', () => {
    expect(shortAddr(undefined)).toBe('?')
    expect(shortAddr('')).toBe('?')
  })
  it('passes through short values unchanged', () => {
    expect(shortAddr('alice.0g')).toBe('alice.0g')
    expect(shortAddr('0203abc')).toBe('0203abc')
  })
  it('truncates a Casper public key to first 6 + last 4', () => {
    expect(
      shortAddr('0203c635e6eb223ae14143e23ceea9440bc773dc87ec0203c635e6eb223ae14143'),
    ).toBe('0203c6…4143')
  })
})
