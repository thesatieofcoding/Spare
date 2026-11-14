# Spare testnet end-to-end

Runs the real SDK and wallets-kit against Stellar TESTNET (Horizon + Soroban RPC) and the live
`https://donatespare.xyz/.well-known/stellar.toml`. Refuses to run unless both endpoints report
the testnet passphrase. Spends a few USDC of the `spare-demo-user` testnet account.

Secrets are read at runtime with `stellar keys secret <name>` and never written anywhere.
Needs keystore entries `spare-demo-user` and `spare-demo-merchant`.

```
pnpm dlx tsx --tsconfig scripts/testnet-e2e/tsconfig.json scripts/testnet-e2e/run.ts
```

Before the scenarios the user's testnet USDC is topped up to 10 from `spare-demo-merchant` (which
receives every demo purchase) when it is below 8. The XLM-paid scenarios (f1, f2, e4, e5) use a fresh
friendbot account that holds XLM only (no USDC trustline) and need XLM -> USDC liquidity on the
testnet DEX (`/paths/strict-receive`); they also check the donation appears as
`path_payment_strict_receive` in Horizon `/accounts/{foundation}/payments`.

Notes: the "foundation without USDC trustline" case serves a toml for a throwaway account through an
injected `fetch` (the live toml cannot list a random account); every other case uses the live toml.
