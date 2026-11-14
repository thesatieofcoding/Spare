# spare-wallets-kit

Add [Spare](../spare-sdk) to an app that signs with [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit): before each signature, the user sees "Add US$0.50 for [foundation]?" and decides. Nothing is added without an explicit yes. Spare never holds funds.

```
pnpm add spare-wallets-kit spare-sdk @creit.tech/stellar-wallets-kit @stellar/stellar-sdk
```

## Quickstart

```ts
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { HorizonAccountPort } from "spare-sdk";
import { withSpare } from "spare-wallets-kit";

const network = "testnet"; // "mainnet" in production

const spare = withSpare(StellarWalletsKit, {   // v1: pass your kit instance
  foundation: { account: "G...", domain: "foundation.org" }, // must list the account in its stellar.toml
  foundationName: "Tellus Cooperative",
  mode: { amount: "0.50" },                    // or { roundUp: true } for USDC purchases
  appId: "my-app",                             // <= 22 ASCII bytes
  maxAmount: "5",
  accounts: new HorizonAccountPort({ network }),
  network,
  locale: "en",                                // "en" | "es"
});

// Same signature as the kit. Use it wherever you called kit.signTransaction.
const { signedTxXdr } = await spare.signTransaction(xdr, { address });
```

Need to know whether the hash changed? Use `signWithDonation`: it returns `{ signedTxXdr, donation, changed, outcome }`.

## Soroban follow-up

A Soroban transaction holds one operation, so the donation is a separate payment after your call succeeds. It needs a second signature, and the modal says so.

```ts
const follow = await spare.offerFollowUp({ successful: true, sourceAccount: address, hash });
if (follow.status === "signed") await submit(follow.signedTxXdr); // submitting is your job
```

## API

| Export | What it does |
| --- | --- |
| `withSpare(kit, options)` | Returns `{ signTransaction, signWithDonation, offerFollowUp, lastDonation }`. |
| `createConfirmModal({ locale?, theme? })` | Default confirmation UI (vanilla DOM, shadow root). Resolves `true` only on the primary button. |

## Options

| Option | Required | Description |
| --- | --- | --- |
| `foundation` | yes | `{ account, domain }`. Domain-verified through SEP-1 `stellar.toml`. |
| `foundationName` | no | Name shown to the user. Defaults to the domain. |
| `mode` | yes | `{ amount: "0.50" }` or `{ roundUp: true }` (USDC purchases only). |
| `appId` | yes | Tag for the `spare:<appId>` memo. |
| `maxAmount` | yes | Your cap per donation, in USDC. |
| `accounts` | yes | `AccountPort` from spare-sdk (e.g. `HorizonAccountPort`). |
| `fetch` | no | Custom fetch for `stellar.toml` lookups. |
| `network` | no | `"mainnet"` (default) or `"testnet"`. Selects the Circle USDC issuer; a tx from another network is signed unchanged. When omitted, it is inferred from the effective `networkPassphrase` (the call's, else the option's) if that is the testnet or mainnet passphrase; an unknown passphrase infers nothing. An explicit `network` always wins. |
| `networkPassphrase` | no | Used to parse XDR when the call does not pass one. Defaults to the passphrase of `network`. With neither, the tx is signed unchanged. |
| `confirm` | no | `(prompt: DonationPrompt) => Promise<boolean>`. Replaces the built-in modal. |
| `locale` / `theme` | no | `"en" \| "es"`; `"light" \| "dark" \| "auto"` for the built-in modal. |
| `wallet` | no | Wallet id (or getter). Defaults to `kit.selectedModule.productId`. `LEDGER` shows the "check your Ledger" note. |
| `followUpAmount` | no | Soroban follow-up amount. Defaults to the fixed `mode.amount`; required with round-up. |

`DonationPrompt`: `{ amount, foundationName, foundationDomain, mode: "fixed" | "round-up", wallet: "classic" | "soroban" | "ledger", locale, secondSignature, purchaseTotal?, roundUpTotal? }`. `purchaseTotal` and `roundUpTotal` come straight from spare-sdk's `donation.purchase` / `donation.roundedTotal`.

## Pass-through rules

- Only **unsigned, non-fee-bump, classic, single-source-signer** transactions are modified. Adding an operation changes the hash and the fee, so anything else (partly signed, multisig, extra signers, fee-bump, Soroban) is signed unchanged and no donation is offered.
- A failed check in spare-sdk (unverified foundation, no trustline, low balance, over the cap) means no prompt and the original is signed.
- The user declines: the **original XDR** is signed, byte for byte.
- Any error inside Spare (bad XDR, lookup failure, confirm crashing) fails closed: the original is signed. Errors from the wallet itself (for example the user rejecting in the wallet) are not swallowed.

## Built-in modal

Matches the Figma "Confirmation modal". `role="dialog"`, `aria-modal`, labelled title, focus trap, Esc skips, focus returns to the opener, `prefers-reduced-motion` respected. It shows "Domain-verified: <domain>" (ES "Dominio verificado: ...") under the title: the foundation's `stellar.toml` lists its account, nothing more. Focus starts on the dialog, not on a button, the primary button ignores activation for the first 400 ms, and the rest of the page is `inert` while it is open. Styles live in a shadow root. Fonts (Instrument Sans, Newsreader) are not bundled: load them yourself or the system fallbacks apply.

See [spare-sdk](../spare-sdk) for the core API.
