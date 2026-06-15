# nebula — claims & evidence

Every pitch claim, with the file/address that backs it. Verified against the codebase
(2026-06-15). Use this to keep the deck/demo honest and to answer judge questions.

## Deployed contracts — ERC-8004 Trustless Agents

| Registry | Mantle mainnet (5000) | Mantle Sepolia (5003) |
|---|---|---|
| Identity | `0x00a818451dC072d449e92a21d02d6B68fc703588` | `0x529ae7B0e8A8191c0307b918AA62f1Fc6557a621` |
| Reputation | `0x56b11a8f34eCb20899BD4E1eA539E194F007F361` | `0x0DA4162BdFaFd0b5a6Da4151E0415aEaBd87B521` |
| Validation | `0x4A222ec3D7e656ADFE28583219Bed3462973DECD` | `0x5eDa2Be8c2c24039952751C817a7E9C8E018628e` |

Client: `packages/core/src/identity/erc8004.ts`, `erc8004-trust.ts`. Deploy logs: `broadcast/`.

## Capabilities — status & evidence

| Capability | Status | Evidence |
|---|---|---|
| Native / ERC-20 transfer | ✅ | `packages/plugin-onchain/src/tools/transfer.ts` |
| Wrap / unwrap MNT | ✅ | `packages/plugin-onchain/src/tools/wrap.ts` |
| Swap — Agni V3 + Merchant Moe (CLI, best-of-two) | ✅ | `tools/swap.ts`, `tools/moe.ts`, `quoter.ts` |
| Swap — OpenOcean aggregator (web) | ✅ | `apps/web/lib/agent.ts` |
| Aave V3 supply/withdraw/borrow/repay (mainnet) | ✅ | `tools/aave.ts`; Pool `0x458F293454fE0d67EC0655f3672301301DD51422` |
| Policy engine (caps, allowlists, slippage, read-only) | ✅ | `policy.ts` (+ `policy.test.ts`) |
| Simulation before write | ✅ | `simulate.ts` |
| Approval floor / bounded autonomy | ✅ | `packages/core` permission/approval |
| Derived agent wallet (web == CLI) | ✅ | `apps/web/lib/agent-wallet.ts` = `keccak256(sig)` |
| Gateway daemon (Telegram, approvals, heartbeat) | ✅ local/self-hosted | `packages/gateway/src/entrypoint.ts` |
| CLI (init, chat, login, identity, gateway, telegram…) | ✅ | `packages/cli/src/commands/` |
| Nansen address risk labels | ✅ | `packages/plugin-onchain/src/nansen.ts` |
| DeFiLlama yields + restricted-asset flags | ✅ | `packages/plugin-onchain/src/defillama.ts` |
| Bybit CEX balance (read-only) | ✅ | `packages/plugin-onchain/src/bybit.ts` |
| Web console (chat, history, SIWE, client-signed) | ✅ | `apps/web/` |

## Do NOT claim (not implemented / mischaracterized)

- ❌ Byreal / OpenClaw / RealClaw — no integration in code.
- ❌ Hosted/SaaS 24/7 gateway — gateway runs locally or self-hosted only (roadmap to host it).
- ❌ Aave on testnet — mainnet (5000) only.
- 🟡 Tencent — only a swappable OpenAI-compatible LLM provider option, not a treasury integration.
- 🟡 Bybit — read-only balance; no trading/withdrawals.
- 🟡 “Best of 3+ aggregators” — CLI routes 2 DEXes (Agni + Moe); web uses 1 aggregator (OpenOcean).
