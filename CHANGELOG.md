# Changelog

All notable changes to `spare-sdk` and `spare-wallets-kit`. Both packages are versioned together.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
