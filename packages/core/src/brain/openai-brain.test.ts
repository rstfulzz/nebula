import { afterEach, describe, expect, it } from 'bun:test'
import type { NebulaEvent } from '../events/types'
import { buildFrozenPrefix } from './frozen-prefix'
import { OpenAIBrain } from './openai-brain'

const origFetch = globalThis.fetch

/** Replace global fetch with a canned OpenAI-compatible /chat/completions response. */
function mockFetch(body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
}

function makeEvent(text: string): NebulaEvent {
  return { id: 'evt-1', source: 'stdin', payload: { label: 'user', data: text }, ts: 0 }
}

const prefix = buildFrozenPrefix({
  systemPrompt: 'You are a test agent.',
  memoryIndex: null,
  identity: null,
  persona: null,
  loadedToolNames: [],
  skills: [],
  timestamp: null,
})

describe('OpenAIBrain', () => {
  afterEach(() => {
    globalThis.fetch = origFetch
  })

  it('returns assistant content from an OpenAI-compatible response', async () => {
    mockFetch({
      choices: [{ message: { content: 'hello from nebula' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
    })
    const brain = new OpenAIBrain({ apiKey: 'test-key', model: 'gpt-4o-mini', tools: [], prefix })
    const turn = await brain.infer({ event: makeEvent('hi') })
    expect(turn.content).toBe('hello from nebula')
    expect(turn.toolCalls).toHaveLength(0)
    expect(turn.usage?.totalTokens).toBe(13)
  })

  it('falls back to reasoning_content when content is empty', async () => {
    mockFetch({
      choices: [
        {
          message: { content: null, reasoning_content: '<think>x</think>the answer' },
          finish_reason: 'stop',
        },
      ],
    })
    const brain = new OpenAIBrain({ apiKey: 'k', tools: [], prefix })
    const turn = await brain.infer({ event: makeEvent('q') })
    expect(turn.content).toBe('the answer')
  })
})
