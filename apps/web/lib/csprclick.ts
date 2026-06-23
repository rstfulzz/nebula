// CSPR.click init config for the /console flow.
// Connects Casper wallets (Casper Wallet, Casper Signer, Ledger, …) and exposes
// message signing + the active account.

import { CONTENT_MODE, type CsprClickInitOptions } from '@make-software/csprclick-core-types'
import { ACTIVE_NETWORK } from './chain/chain'

const appId = process.env.NEXT_PUBLIC_CSPR_CLICK_APP_ID ?? 'nebula'

export const csprClickOptions: CsprClickInitOptions = {
  appName: 'nebula · console',
  appId,
  contentMode: CONTENT_MODE.POPUP,
  // The standard Casper wallet set. casper-wallet covers the Casper Wallet
  // browser extension; casper-signer is the legacy Signer; ledger + metamask-snap
  // round out the common providers.
  providers: ['casper-wallet', 'casper-signer', 'ledger', 'metamask-snap'],
  chainName: ACTIVE_NETWORK.chainName,
  casperNode: ACTIVE_NETWORK.rpcUrl,
}
