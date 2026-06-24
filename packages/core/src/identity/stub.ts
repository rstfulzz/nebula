import { placeholderAgentId } from '../paths'
import type { AgentIdentity, IdentityProvider } from './types'

/**
 * Local stub identity provider. Fabricates an agent id from the agent account
 * so runtime + memory have something stable to key on before the identity token
 * is registered on the Odra registry.
 */
export class StubIdentity implements IdentityProvider {
  constructor(
    private readonly ownerAddress: string,
    private readonly agentAccount: string,
    private readonly subname?: string,
  ) {}

  async current(): Promise<AgentIdentity> {
    return {
      agentId: placeholderAgentId(this.agentAccount),
      identity: {
        contract: null,
        tokenId: null,
        ownerAddress: this.ownerAddress,
        network: 'local-stub',
      },
      agentAccount: this.agentAccount,
      subname: this.subname,
    }
  }
}
