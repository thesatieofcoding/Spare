# Changelog

All notable changes to `spare-sdk` and `spare-wallets-kit`. Both packages are versioned together.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.4] - 2026-11-14

### Added

- `spare-sdk`: pay the donation in XLM. `payWith: "xlm"` with a `quotes` port (`PathQuotePort`) builds a
  `pathPaymentStrictReceive` (send XLM, receive exactly the amount in Circle USDC) instead of a USDC payment, for
  both `addDonation` and `donateAfter`. `sendMax` = quote + `slippageBps` (default 200 = 2%, integer 0-1000, rounded
  up). The donor needs no USDC trustline; XLM above the minimum reserve must cover `sendMax`, the fee and any XLM the
  tx sends. The foundation checks are unchanged (authorized Circle-USDC trustline, domain-verified). New reason
  `no-path` (no path, failed quote, or a path longer than 5 hops). `HorizonPathQuotePort` quotes through Horizon
  `/paths/strict-receive` with `source_assets=native`. `DonationInfo` gains `payWith` and, for XLM, `sendMax(Stroops)`
  and `quotedXlm(Stroops)`. Exports `xlmSendMax`, `DEFAULT_SLIPPAGE_BPS`, `MAX_SLIPPAGE_BPS`, `PayWith`.
- `spare-wallets-kit`: the donor chooses the amount and pay asset. Presets (`presets`, default US$0.10 / 0.25 / 0.50,
  smallest preselected), an "other amount" field (US$0.01 up to `maxAmount`), round-up only for USDC purchases, and an
  XLM/USDC toggle with "≈ N XLM max" when `quotes` is set (`payWith` picks the preselected asset). Each change is
  re-checked; ineligible options are disabled. Custom `confirm` functions get `prompt.choices`
  (`check` / `select`). EN + ES strings.
- Demo: the purchase defaults to XLM (USDC selectable), the donation defaults to XLM, and the Soroban flow transfers
  through the native XLM Stellar Asset Contract, so a wallet holding only XLM can run both flows on testnet.
- Testnet E2E: XLM-paid classic and Soroban donations from an account with no USDC trustline, custom amounts, and a
  check that the path payment is listed in Horizon `/accounts/{foundation}/payments`.

### Changed (behavior / migration)

1. `spare-wallets-kit`: the amount/asset picker is opt-in for existing integrations. It is on when `presets` is
   set or `mode` is omitted (default: the smallest preset). An explicit `mode` without `presets` keeps the 0.1.3
   single-amount yes/no prompt (no `choices`, no "other amount" field).
2. `DonationInfo.payWith` is a new optional field (absent means `"usdc"`).
3. Paying in XLM, `withSpare` re-quotes live when the donor says yes and rebuilds the tx with exactly the `sendMax`
   the donor approved as the cap. It signs only if the fresh raw quote fits under that cap and the donation is
   otherwise identical; otherwise the original is signed with `outcome: "not-offered"`, `reason: "quote-changed"`
   (`offerFollowUp`: `skipped` / `quote-changed`). No new outcome value. XLM quotes are never cached; accounts and
   `stellar.toml` are read once per prompt. `spare-sdk` gains the optional `sendMax` cap used for this.
4. An XLM-paid donation next to a USDC purchase still requires the donor's authorized USDC trustline and balance
   for the purchase. The donation shares the transaction with the purchase: a price move past `sendMax` fails both
   (only the fee is spent).
5. `HorizonPathQuotePort` throws when given a custom `horizon` URL without `network`.
6. The modal accepts a decimal comma in Spanish only.
7. Known limitation: the XLM balance check uses the account's current reserve and does not count subentries the
   app's own tx adds (`changeTrust`, `manageData`, offers), so such a tx can still fail with `op_underfunded`.

## [0.1.3] - 2026-11-14

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
