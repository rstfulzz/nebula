import { describe, expect, test } from 'bun:test'
import { cardToTextRecords, emptyCard, parseCard, renderCard } from './card'

describe('card', () => {
  test('parses frontmatter + body', () => {
    const md = `---
name: Alice
bio: research nebula
skills:
  - research
  - writing
---

Free-form body here.`
    const c = parseCard(md)
    expect(c.frontmatter.name).toBe('Alice')
    expect(c.frontmatter.bio).toBe('research nebula')
    expect(c.frontmatter.skills).toEqual(['research', 'writing'])
    expect(c.body.trim()).toBe('Free-form body here.')
  })

  test('rejects missing name', () => {
    expect(() => parseCard('---\nbio: no name\n---\nbody')).toThrow()
  })

  test('round-trips via render', () => {
    const c = {
      frontmatter: { name: 'Bob', bio: 'hi', skills: ['code'] },
      body: 'Body.',
    }
    const rendered = renderCard(c)
    const parsed = parseCard(rendered)
    expect(parsed.frontmatter.name).toBe('Bob')
    expect(parsed.frontmatter.skills).toEqual(['code'])
  })

  test('emptyCard is parseable after setting a name', () => {
    const c = emptyCard()
    c.frontmatter.name = 'Temp'
    const rendered = renderCard(c)
    const parsed = parseCard(rendered)
    expect(parsed.frontmatter.name).toBe('Temp')
  })

  test('cardToTextRecords includes address + agent:identity when present', () => {
    const c = {
      frontmatter: {
        name: 'Alice',
        bio: 'hi',
        skills: ['research', 'writing'],
        identity: 'casper:casper-test:hash-abc:42',
        avatar: 'deadbeef',
      },
      body: '',
    }
    const agentAccount = '0202c1bd9c1bb1f3a9e8c4d0e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7a8'
    const r = cardToTextRecords(c, agentAccount)
    expect(r.address).toBe(agentAccount)
    expect(r['agent:bio']).toBe('hi')
    expect(r['agent:skills']).toBe('research,writing')
    expect(r['agent:identity']).toBe('casper:casper-test:hash-abc:42')
    expect(r.avatar).toBe('deadbeef')
  })

  test('cardToTextRecords omits empty fields', () => {
    const c = emptyCard()
    c.frontmatter.name = 'NoExtras'
    const r = cardToTextRecords(c)
    expect(Object.keys(r)).toHaveLength(0)
  })
})
