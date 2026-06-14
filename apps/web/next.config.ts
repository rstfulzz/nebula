import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // Pin file-tracing root to this app so Next doesn't warn about the bun
  // workspace root vs the app-local lockfile created on the deploy host.
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [70, 75, 85, 95],
  },
  async rewrites() {
    return [
      { source: '/llms.txt', destination: '/llms' },
      { source: '/llms-full.txt', destination: '/llms/full' },
      { source: '/docs/:slug.md', destination: '/llms/docs/:slug' },
    ]
  },
}

export default config
