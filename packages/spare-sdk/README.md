# spare-sdk

Add a per-transaction USDC micro-donation to any Stellar app. The donation goes straight to the foundation's account; Spare never holds funds. Circle USDC only, domain-verified foundations only.

```
pnpm add spare-sdk @stellar/stellar-sdk
```

## Classic transaction: `addDonation`

```ts
import { addDonation, HorizonAccountPort } from "spare-sdk";

const network = "testnet"; // "mainnet" in production

const result = await addDonation(unsignedTx, {
  foundation: { account: "G...", domain: "foundation.org" }, // must be listed in its stellar.toml
  amount: "0.50",            // or: roundUp: true (only when the purchase is USDC)
  appId: "my-app",           // <= 22 ASCII bytes, memo becomes "spare:my-app"
  maxAmount: "5",            // your cap per donation
  accounts: new HorizonAccountPort({ network }),
  network,
});

switch (result.status) {
  case "offered":      // ask the user "Add US$<result.donation.amount>?", then sign result.transaction
  case "not-offered":  // sign the original tx; result.reason says why (e.g. "insufficient-balance")
  case "passthrough":  // signed / fee-bump / multisig / extra signers / Soroban: sign the original tx
}
```

`offered` returns a new unsigned tx (new hash, fee raised by one operation, memo set only if it was empty and no destination requires one). Nothing is added without the user's explicit yes.

`@stellar/stellar-sdk` is a peer dependency: install it next to `spare-sdk` (one copy shared with your app).

### Round-up

Only when the whole tx is a Circle-USDC purchase (payments, `pathPaymentStrictSend`, sell offers). The SDK reports what it used, so show these instead of recomputing: `result.donation.purchase` / `purchaseStroops` (the USDC purchase) and `roundedTotal` / `roundedTotalStroops` (purchase + donation). They are set on round-up only.

- Already whole (e.g. 5.00): `round-up-already-whole`.
- `pathPaymentStrictReceive`, XLM or other-asset ops, or unmodelled ops in the same tx: `round-up-needs-usdc-purchase` (the real spend is unknown up front, so Spare never rounds `sendMax`).

### Networks

`network` is `"mainnet"` (default) or `"testnet"` and selects the only accepted Circle USDC issuer:

- mainnet: `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
- testnet: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`

A tx built for the other network is `not-offered` with `network-mismatch`. Pass the same `network` to `new HorizonAccountPort({ network })` so balances are read from the right Horizon. (`NETWORKS` exports both configs.)

### Reason codes

`passthrough` (tx untouched): `fee-bump`, `already-signed`, `soroban`, `multiple-sources`, `multisig` (the master key alone cannot meet the tx's threshold: medium, or high with `setOptions`/`accountMerge`), `extra-signers` (CAP-21 `extraSigners` precondition).

`not-offered`: `invalid-options` (incl. malformed `baseFee`), `invalid-app-id`, `invalid-amount`, `invalid-foundation`, `amount-over-cap`, `round-up-needs-usdc-purchase`, `round-up-already-whole`, `foundation-not-verified`, `foundation-trustline-missing`, `foundation-trustline-unauthorized`, `foundation-trustline-full` (no room under the trustline limit), `user-trustline-missing`, `user-trustline-unauthorized`, `unsupported-operation` (the tx has ops that can spend funds in ways Spare does not model, e.g. `manageBuyOffer`, `createClaimableBalance`, `liquidityPoolDeposit`, `accountMerge`), `insufficient-balance` (USDC, or XLM for the fee plus any XLM the tx sends), `network-mismatch` (the tx passphrase is not the one of `network`), `account-lookup-failed`, `main-tx-not-successful`, `account-not-synced` (`donateAfter` only: Horizon did not catch up with the main tx in time), and, from `donateAfter` only, `multisig`.

### Memo and SEP-29

If a payment, path payment or merge destination has `config.memo_required` set, Spare does not set its memo, so your app's own `checkMemoRequired` still fires. The donation is still offered, with `donation.attributed === false`. A destination that cannot be read is treated as memo-required.

### Fees

`baseFee` is per operation, digits only, minimum 100 stroops. A malformed value, or one whose total fee (rate x operations) would exceed the uint32 limit, gives `not-offered` / `invalid-options`; it never throws. The same reason is returned for a zero-operation tx and for missing `foundation` / `accounts` (plain-JS callers); a non-string `amount` / `maxAmount` gives `invalid-amount`. A tx with a fee of 0 is raised to 100 per operation, and the same number is used for the balance check and the built tx.

## Soroban call: `donateAfter`

A Soroban tx holds one operation, so the donation is a separate payment after success. It needs a second signature: tell the user before they accept.

```ts
import { donateAfter } from "spare-sdk";

const follow = await donateAfter(
  { successful: true, sourceAccount: userAccount, hash },
  { foundation, amount: "0.50", appId: "my-app", maxAmount: "5",
    accounts, network },
);
if (follow.status === "offered") { /* confirm, then sign follow.transaction */ }
```

The follow-up is a single payment (medium threshold). If the user's account needs more than its master key to sign that, nothing is offered (`multisig`).

Horizon can lag the RPC that reported SUCCESS. Pass the main tx's `ledger` (RPC `getTransaction().ledger`) and/or `sequence` in the first argument: `donateAfter` then re-reads the account (default every 1 s, up to 10 s; `syncIntervalMs`, `syncTimeoutMs`, injectable `sleep`) until the view's `ledger` (Horizon `last_modified_ledger`) is at least that ledger, or its `sequence` is at least the main tx's. If it never catches up the result is `not-offered` / `account-not-synced` and nothing is built. Without `ledger` or `sequence` there is no wait.

## Account port

`AccountPort.loadAccount(id)` returns an `AccountSnapshot`: `sequence`, optional `ledger`, `xlmAvailable`, `usdc` (`{ balance, authorized, headroom }` or `null`), `masterWeight`, `thresholds` (`{ low, medium, high }`) and `memoRequired`. `HorizonAccountPort` fills it from Horizon (`headroom` = limit - balance - buying liabilities; `memoRequired` from the `config.memo_required` data entry). `requiresMultipleSignatures` is gone: Spare decides from `masterWeight` and `thresholds` per transaction.

## Helpers

`verifyFoundation(foundation)`, `listVerifiedFoundations(candidates)` (SEP-1 `ACCOUNTS` check: https only, no redirects, 5 s timeout, body capped at 100 KB), `parseUsdc`, `formatStroops`, `roundUpToWholeDollar`. Network access (`fetch`, `AccountPort`) is injectable.
