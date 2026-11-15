# spare-indexer

Private package. Indexes Spare registry events and USDC donations into one deterministic `snapshot.json`.

```
pnpm -C packages/spare-indexer start index   [--network mainnet|testnet] [--config indexer.config.json] [--out snapshot.json]
pnpm -C packages/spare-indexer start rebuild [same flags]
```

`index` needs `SPARE_RPC_URL`. `rebuild` re-derives payments from Horizon only and never touches RPC; use it after exit code 2.

| Exit | Meaning |
|---|---|
| 0 | ok |
| 1 | runtime error |
| 2 | RPC history gap: run `rebuild` |
| 3 | config or usage error (bad flags, missing config/section, empty `registryContracts`, missing `SPARE_RPC_URL`) |

`indexer.config.json` has one section per network. `mainnet.registryContracts` is intentionally empty: `index`/`rebuild` on mainnet exit 3 until the registry is deployed and its contract id plus `startLedger` are added (runbook step 6). The default network is `mainnet`.

Domain verification fetches each foundation's `stellar.toml` through an undici dispatcher whose DNS lookup rejects loopback, private, link-local (incl. cloud metadata), CGNAT, ULA, unspecified and IPv4-mapped equivalents at connect time.
