# Recorded fixtures

Public chain data only, recorded read-only (no keys, no submissions) on 2026-11-14.
Raw files may contain donor (source/from) addresses; adapters must never propagate them
(see `horizon-adapter.test.ts` / `rpc-adapter.test.ts` privacy assertions).

| File | Source | Network | Notes |
|---|---|---|---|
| `horizon-payments-page{1,2,3}.json` | `https://horizon.stellar.org/accounts/GBTDED5SE2QAKFQ3Y6NY75QGCKQTQ3Z6H3ZYM4PWUX3X36QMOKEEJFPQ/payments?join=transactions&order=asc&limit=10` and its `_links.next` pages | mainnet | Demo foundation, full history (19 records, 3rd page empty). Trimmed: per-record `_links`, XDR blobs, signatures and fee fields removed; `transaction` keeps hash, ledger, memo, memo_bytes, successful. Contains anchor tx `557f7fd0...96f1`. |
| `horizon-root.json` | `https://horizon.stellar.org/` | mainnet | Trimmed to version info, `history_latest_ledger`, passphrase. |
| `rpc-getHealth.json` | `getHealth` on `https://rpc.lightsail.network/` | mainnet | `result` object only (the transport returns `result`). |
| `rpc-getEvents-usdc-anchor.json` | `getEvents` on `https://rpc.lightsail.network/`, ledgers 65477361-65477362, USDC SAC `CCW67TSZ...MI75`, topics `[transfer, *, <foundation>, *]` | mainnet | One CAP-67 `transfer` event for the anchor path payment (value is a map with `amount` and `to_muxed_id`). |
| `rpc-getTransaction-anchor.json` | `getTransaction` for the anchor tx on `https://rpc.lightsail.network/` | mainnet | Trimmed to status, ledger, createdAt, applicationOrder, txHash, envelopeXdr. |
| `rpc-getLedgerEntries-missing.json` | `getLedgerEntries` on `https://soroban-testnet.stellar.org` for the registry key `Vec[Symbol(Foundation), Address]` | testnet | Real "entry not live" answer (`entries: []`) for contract `CDCYBSVI...I2RF` (local `~/.config/stellar` id of the testnet registry). |

Registry events: the testnet registry had no events inside RPC retention on 2026-11-14 (and the mainnet
registry is not deployed), so registry `getEvents` rows are SYNTHETIC. `fixtures/rpc-synthetic.ts` builds them
from real ScVal shapes: topics `[Symbol(spare), Symbol(kind), Address]`, data `Vec[String, String]`.

Anchor (D6 parity): tx `557f7fd0...96f1`, ledger 65477361, op 2 (1-based) is a `path_payment_strict_receive`
delivering 0.10 Circle USDC to the demo foundation. Horizon op id low 12 bits = 2 (1-based) and the RPC event
carries `operationIndex: 1` (event TOID low 12 bits = 1); both map to opIndex 1.
