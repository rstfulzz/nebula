// Wagmi + RainbowKit config for the /console flow.

import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'viem'
import { zgMainnet, zgTestnet } from './chain/chain'

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'nebula-dev'

export const wagmiConfig = getDefaultConfig({
  appName: 'nebula · console',
  projectId,
  chains: [zgMainnet, zgTestnet],
  transports: {
    [zgMainnet.id]: http(),
    [zgTestnet.id]: http(),
  },
  ssr: true,
})
