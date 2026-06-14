import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import { z } from 'zod'
import { agentPaths } from '../paths'
import type { ToolDef } from '../tools/types'

/**
 * `memory.list` — enumerate every memory file the agent has stored locally.
 *
 * Returns two sections:
 *   - `agent[]`: files under `memory/agent/` (identity, persona, learned-*)
 *   - `user[]`: files under `memory/user/` (feedback, project, reference, profile)
 *
 * Use when the operator asks to enumerate what the agent knows. `memory.read`
 * fetches individual file bodies; this tool just lists what's available.
 */
const listSchema = z.object({})

export type MemoryListArgs = z.infer<typeof listSchema>

export interface MemoryListAgentFile {
  file: string
  title: string
  description: string | null
  bytes: number
}

export interface MakeMemoryListToolArgs {
  agentId: string
  agentDir?: string
}

export function makeMemoryListTool(opts: MakeMemoryListToolArgs): ToolDef<MemoryListArgs> {
  const memDir = opts.agentDir
    ? join(opts.agentDir, 'memory')
    : agentPaths.agent(opts.agentId).memoryDir
  return {
    name: 'memory.list',
    description:
      "Enumerate every memory file the agent has stored (agent + user partitions). Call when the operator asks 'show me all your memory' / 'what do you remember' / 'list everything you have stored'. Returns two sections: agent (identity, persona, learned-*) and user (feedback, project, reference, profile).",
    schema: listSchema,
    handler: async () => {
      const [agentFiles, userFiles] = await Promise.all([
        listPartition(memDir, 'agent'),
        listPartition(memDir, 'user'),
      ])
      return {
        ok: true,
        data: {
          agent: agentFiles,
          user: userFiles,
        },
      }
    },
  }
}

async function listPartition(
  memDir: string,
  partition: 'agent' | 'user',
): Promise<MemoryListAgentFile[]> {
  const dir = join(memDir, partition)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const results = await Promise.all(
    names
      .filter(n => n.endsWith('.md'))
      .map(async name => {
        const filePath = join(dir, name)
        try {
          const [statResult, content] = await Promise.all([
            stat(filePath),
            readFile(filePath, 'utf8'),
          ])
          if (!statResult.isFile()) return null
          // gray-matter on first 4KB is enough for frontmatter parse.
          const head = content.length > 4096 ? content.slice(0, 4096) : content
          let title = name.replace(/\.md$/, '')
          let description: string | null = null
          try {
            const parsed = matter(head)
            const fm = parsed.data as { name?: string; description?: string }
            if (fm.name && typeof fm.name === 'string') title = fm.name
            if (fm.description && typeof fm.description === 'string') description = fm.description
          } catch {
            // Bad frontmatter — fall back to filename.
          }
          return {
            file: `${partition}/${name}`,
            title,
            description,
            bytes: statResult.size,
          } satisfies MemoryListAgentFile
        } catch {
          return null
        }
      }),
  )
  return results.filter((r): r is MemoryListAgentFile => r !== null)
}
