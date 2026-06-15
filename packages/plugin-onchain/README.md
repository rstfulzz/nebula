# nebula-ai-plugin-onchain

The **Mantle limbs** for **nebula** — the brain tools that do real on-chain work,
every value-moving call routed through the deterministic policy → simulation →
approval pipeline:

- **Wallet / account** — `account.info`, `chain.balance`, `tokens.info`
- **Transfers** — `chain.send`, `chain.wrap`, `chain.unwrap`
- **Trading** — `swap.best` / `swap.compare` (**Agni Finance** + **Merchant Moe**
  best-execution), `swap.quote` / `swap.execute`, `moe.quote` / `moe.swap`
- **Lending** — full **Aave V3** suite: `aave.markets` / `position` / `supply` /
  `withdraw` / `borrow` / `repay`
- **Discovery + risk** — `defi.yields` (DeFiLlama), `risk.token`, `nansen.labels`,
  `cex.balance` (Bybit, read-only)
- **Identity** — `identity.resolve` / `identity.register` (**ERC-8004** Trustless
  Agents)
- **Controls + analysis** — `policy.show`, `tx.simulate`, `chain.read` /
  `chain.write`, `chain.tx` / `chain.contract` / `chain.activity`, `chain.block` /
  `chain.gas`

## Install

Auto-installed with [`nebula-ai-agent`](https://www.npmjs.com/package/nebula-ai-agent).
Or directly: `bun add nebula-ai-plugin-onchain`.

See the [root README](https://github.com/rstfulzz/nebula#readme) for the full tool reference.
