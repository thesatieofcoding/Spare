# Spare testnet end-to-end

Runs the real SDK and wallets-kit against Stellar TESTNET (Horizon + Soroban RPC) and the live
`https://donatespare.xyz/.well-known/stellar.toml`. Refuses to run unless both endpoints report
the testnet passphrase. Spends a few USDC of the `spare-demo-user` testnet account.

Secrets are read at runtime with `stellar keys secret <name>` and never written anywhere.
Needs keystore entries `spare-demo-user` and `spare-demo-merchant`.

```
pnpm dlx tsx --tsconfig scripts/testnet-e2e/tsconfig.json scripts/testnet-e2e/run.ts
```

Notes: the "foundation without USDC trustline" case serves a toml for a throwaway account through an
injected `fetch` (the live toml cannot list a random account); every other case uses the live toml.
