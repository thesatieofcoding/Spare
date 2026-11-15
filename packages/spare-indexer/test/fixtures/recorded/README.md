# Recorded fixtures

Public chain data only, recorded read-only (no keys, no submissions) on 2026-11-14.
Raw files may contain donor (source/from) addresses; adapters must never propagate them
(see `horizon-adapter.test.ts` / `rpc-adapter.test.ts` privacy assertions).

| File | Source | Network | Notes |
|---|---|---|---|
| `horizon-payments-page{1,2,3}.json` | `https://horizon.stellar.org/accounts/GBTDED5SE2QAKFQ3Y6NY75QGCKQTQ3Z6H3ZYM4PWUX3X36QMOKEEJFPQ/payments?join=transactions&order=asc&limit=10` and its `_links.next` pages | mainnet | Demo foundation, full history (19 records, 3rd page empty). Trimmed: per-record `_links`, XDR blobs, signatures and fee fields removed; `transaction` keeps hash, ledger, memo, memo_bytes, successful. Contains anchor tx `557f7fd0...96f1`. |
| `horizon-root.json` | `https://horizon.stellar.org/` | mainnet | Trimmed to version info, `history_latest_ledger`, passphrase. |
