# Changelog

All notable changes to `spare-sdk` and `spare-wallets-kit`. Both packages are versioned together.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `spare-sdk`: `donateAfter` waits (bounded, `syncTimeoutMs` / `syncIntervalMs` / `sleep`) for Horizon to ingest the
  main tx's `ledger` before reading the account, and returns `not-offered` with the new reason `account-not-synced`
  if it never does. `HorizonAccountPort` reports Horizon's latest ingested ledger (from `history_latest_ledger`,
  the `Latest-Ledger` value) in `AccountSnapshot.ledger`, so it also works for sponsored txs. `sequence` stays an
  optional extra signal for when the donor was the tx source.
- Testnet end-to-end script for the classic and Soroban flows.
- Docs: testnet quick start with a demo foundation, funding recipe, Node example and `signWithDonation`;
  install notes (npm/pnpm/yarn, ESM) in the package READMEs; `/docs/quickstart/` redirects to `/docs/quick-start/`.
- Demo: the Soroban follow-up passes the main tx ledger, and an uncertain follow-up submit is looked up until the
  tx's own timebound has passed before it is reported as failed.

### Changed (behavior / migration)

1. `spare-wallets-kit` now infers `network` from the transaction's passphrase when no `network` option is set.
   In 0.1.2 a testnet passphrase without `network` gave `network-mismatch`; it now works as testnet.
2. `spare-sdk`: bad input never throws. A zero-operation tx, a fee rate whose total exceeds uint32, wrongly typed
   amounts and a missing `foundation` / `accounts` return `not-offered` with `invalid-options` or `invalid-amount`.
3. `spare-sdk`: the foundation domain is normalized before fetching `stellar.toml`.
4. `AccountSnapshot.ledger` means the latest ingested ledger of the data source, not the account's last-modified
   ledger (additive; the field is optional).

## [0.1.2]

### Added

- `spare-sdk`: `network: 'mainnet' | 'testnet'` option on `addDonation` and `donateAfter`, plus the `NETWORKS` export.
  Each network is locked to its own Circle USDC issuer:
  - mainnet: `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
  - testnet: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
- `spare-sdk`: `HorizonAccountPort({ network })`.
- `spare-wallets-kit`: `SpareOptions.network`.
- Docs quick start now shows `network`, backed by the CI-tested `examples/quickstart`.

### Deprecated

- `donateAfter` option `networkPassphrase`; use `network`.

### Changed (behavior / migration)

1. A transaction built with the testnet passphrase but without `network` now returns `not-offered` with reason
   `network-mismatch`. Previously it built a payment using the mainnet issuer. Pass `network: 'testnet'`.
2. `spare-wallets-kit`: with no `network` and no passphrase (per call or in options) the kit signs the
   transaction unchanged, as in 0.1.1 (outcome `error`, reason `missing-network-passphrase`). Pass `network`.
   An explicit `network` supplies the passphrase.
3. An unknown runtime network returns `not-offered` with reason `invalid-options` (SDK) and fails closed with
   `missing-network-passphrase` (kit).
4. `new HorizonAccountPort("<url>")` (string form) always reports network mainnet, even for a testnet Horizon URL.
   For testnet use `new HorizonAccountPort({ network: "testnet" })`.
