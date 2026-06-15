# nebula web console

The browser surface for [nebula](../../README.md) — a Mantle-native, policy-aware
AI treasury agent. Live at **[nebulaai.space](https://nebulaai.space)**.

A Next.js 15 app with three parts:

- **Chat console** (`/console`) — prompt nebula in plain English. It answers with
  **live on-chain data** (balances, portfolio, gas, yields, swap quotes, ERC-8004
  lookups) and **executes** from your own wallet: transfers, wrap/unwrap, **swap**
  (OpenOcean → Merchant Moe / Agni), **Aave** lend/borrow/repay/withdraw. Every
  value-moving action is policy-capped, prepared server-side, and **signed by your
  connected wallet** — the server holds no key. Per-wallet chat history syncs
  server-side when you sign in.
- **Agents** (`/console/agents`) — the ERC-8004 identities your wallet owns:
  agent card, reputation, validations.
- **Docs** (`/docs`, `/llms.txt`) — the documentation site.

Plus a **derived agent wallet**: sign once to derive a deterministic wallet (the
same one the CLI derives from your operator wallet) and let it sign autonomously
within policy, or keep per-tx signing with your main wallet.

## Setup

```bash
cp .env.local.example .env.local   # then fill it in
npm install                        # standalone — no workspace deps
npm run dev                        # http://localhost:3210
```

Environment (`.env.local`):

| Var | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | LLM brain for `/api/chat` (any OpenAI-compatible; `NEBULA_LLM_BASE_URL`/`NEBULA_LLM_MODEL` optional) |
| `SESSION_SECRET` | iron-session signing key for SIWE (≥32 chars; `openssl rand -hex 32`) |
| `NEXT_PUBLIC_WC_PROJECT_ID` | WalletConnect/Reown project id (public client id) |
| `NEBULA_POLICY_MAX_NATIVE_MNT` | per-tx native-MNT policy cap (default 25) |

Writes are signed client-side, so **no signer key lives on the server**.

## Build & deploy

```bash
npm run build      # next build
npm run start      # next start -p 3210
```

Production runs on a plain Node host under pm2. [`scripts/deploy-web.sh`](../../scripts/deploy-web.sh)
mirrors `origin/main`, installs the web deps in isolation from the bun workspace,
builds to a temp dir + atomically swaps it in (so chunks never 404 mid-deploy),
and restarts pm2. The [`deploy-web`](../../.github/workflows/deploy-web.yml) workflow
runs it over SSH automatically on every push that touches `apps/web/**`.

## Notes

- **Standalone**: this app has zero `nebula-ai-*` workspace imports, so it builds
  with plain `npm` on a Node host (no bun required). Chain I/O via viem/wagmi.
- The agent-wallet derivation is byte-identical to the CLI
  ([`packages/cli/src/profile/derive.ts`](../../packages/cli/src/profile/derive.ts)),
  so web and CLI resolve to the same wallet.
