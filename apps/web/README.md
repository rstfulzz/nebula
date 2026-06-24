# nebula web console

The browser surface for [nebula](../../README.md) — a Casper-native, policy-aware
AI treasury agent. Live at **[nebulaai.space](https://nebulaai.space)**.

A Next.js 15 app with three parts:

- **Chat console** (`/console`) — prompt nebula in plain English. It answers with
  **live on-chain data** (balances, validators, on-chain registry lookups) and
  **executes** policy-gated Casper actions — native CSPR transfers, staking /
  unstaking — each run through the deterministic policy and **verified on-chain**
  before it reports success. Per-account chat history syncs server-side when you
  sign in with your Casper wallet.
- **Agents** (`/console/agents`) — the on-chain identities your account owns:
  agent card, reputation, validations (the Odra registries).
- **Docs** (`/docs`, `/llms.txt`) — the documentation site.

Wallet connect + sign-in use **CSPR.click**; the active account is a Casper public
key / account hash.

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
| `SESSION_SECRET` | iron-session signing key for the Casper sign-in session (≥32 chars; `openssl rand -hex 32`) |
| `NEXT_PUBLIC_CSPR_CLICK_APP_ID` | CSPR.click App ID (public client id) |
| `CSPR_CLOUD_API_KEY` / `CASPER_NODE_RPC` / `CASPER_CHAIN_NAME` / `CASPER_SECRET_KEY_PATH` | the Casper chat backend (server-side signer + node) |
| `NEBULA_POLICY_MAX_NATIVE_CSPR` | per-tx native-CSPR policy cap (default 100) |

The chat backend signs server-side with `CASPER_SECRET_KEY_PATH`, policy-gated and
on-chain-verified; CSPR.click handles wallet connect + sign-in.

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
  with plain `npm` on a Node host (no bun required). Chain I/O via casper-js-sdk +
  CSPR.click.
- The agent-wallet derivation is byte-identical to the CLI
  ([`packages/cli/src/profile/derive.ts`](../../packages/cli/src/profile/derive.ts)),
  so web and CLI resolve to the same account.
