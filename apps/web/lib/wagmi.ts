// Wagmi + RainbowKit config for the /console flow.

import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'viem'
import { mantleMainnet, mantleTestnet } from './chain/chain'

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'nebula-dev'

export const wagmiConfig = getDefaultConfig({
  appName: 'nebula · console',
  projectId,
  chains: [mantleMainnet, mantleTestnet],
  transports: {
    [mantleMainnet.id]: http(),
    [mantleTestnet.id]: http(),
  },
  ssr: true,
})
