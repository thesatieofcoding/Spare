# spare-wallets-kit

Add [Spare](../spare-sdk) to an app that signs with [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit): before each signature, the user sees "Add US$0.50 for [foundation]?" and decides. Nothing is added without an explicit yes. Spare never holds funds.

```
pnpm add spare-wallets-kit spare-sdk @creit.tech/stellar-wallets-kit @stellar/stellar-sdk
npm install spare-wallets-kit spare-sdk @creit.tech/stellar-wallets-kit @stellar/stellar-sdk
yarn add spare-wallets-kit spare-sdk @creit.tech/stellar-wallets-kit @stellar/stellar-sdk
```

ESM only, Node 20 or newer: in a Node project set `"type": "module"` in `package.json`. `@creit.tech/stellar-wallets-kit` is an optional peer: a headless Node app can skip it (see below).

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

The placeholders `G...` / `foundation.org` are for production: use your foundation's registered account and its website domain.

Need to know whether the hash changed? Use `signWithDonation`: it returns `{ signedTxXdr, donation, changed, outcome, reason? }`. `outcome` is `"donated" | "declined" | "not-offered" | "passthrough" | "error"`; everything except `"donated"` signs your original transaction, and `reason` says why (for example `insufficient-balance`).

## Try it on testnet (Node, no browser)

The demo foundation `GCAEBBLSVFM2RLNBYMEZLFWHCXFHOGVJAXQK2K3WVHS2UGVDVWJOXGQJ` (domain `donatespare.xyz`) works on testnet. It is **not a charity**: testnet donations are demo funds that return to the Spare builder. You need a testnet account with Circle testnet USDC (issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`); the [quick start](https://donatespare.xyz/docs/quick-start/) has a short script that funds one (Friendbot, trustline, XLM to USDC on the testnet DEX).

Any object with `signTransaction(xdr, opts)` works as the kit, so a headless app passes its own signer and a custom `confirm`. Save as `donate.ts` and run `SECRET=S... npx tsx donate.ts`:

```ts
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { HorizonAccountPort } from "spare-sdk";
import { withSpare } from "spare-wallets-kit";

const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const keypair = Keypair.fromSecret(process.env.SECRET!); // a testnet secret key (S...)

// 1. The transaction your app already builds: pay 1 XLM to a (freshly funded) merchant.
const merchant = Keypair.random();
await fetch(`https://friendbot.stellar.org?addr=${merchant.publicKey()}`);
const tx = new TransactionBuilder(await server.loadAccount(keypair.publicKey()), {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.payment({ destination: merchant.publicKey(), asset: Asset.native(), amount: "1" }))
  .setTimeout(60)
  .build();

// 2. A headless "wallet". The kit only needs a signTransaction(xdr, opts) that returns { signedTxXdr }.
const signer = {
  async signTransaction(xdr: string, opts?: { networkPassphrase?: string }) {
    const toSign = TransactionBuilder.fromXDR(xdr, opts?.networkPassphrase ?? Networks.TESTNET);
    toSign.sign(keypair);
    return { signedTxXdr: toSign.toXDR() };
  },
};

// 3. Spare wraps it. A custom `confirm` replaces the browser modal: return true only on an explicit yes.
const spare = withSpare(signer, {
  foundation: { account: "GCAEBBLSVFM2RLNBYMEZLFWHCXFHOGVJAXQK2K3WVHS2UGVDVWJOXGQJ", domain: "donatespare.xyz" },
  foundationName: "Spare demo foundation",
  mode: { amount: "0.50" },
  appId: "quickstart",
  maxAmount: "5",
  accounts: new HorizonAccountPort({ network: "testnet" }),
  network: "testnet",
  confirm: async (prompt) => {
    console.log(`Add US$${prompt.amount} for ${prompt.foundationName}? (auto-yes in this demo)`);
    return true;
  },
});

// Pass the passphrase so the kit can parse the XDR.
const result = await spare.signWithDonation(tx.toXDR(), { networkPassphrase: Networks.TESTNET });
console.log(result.outcome, result.reason ?? "", "changed:", result.changed);
// "donated": changed is true and the signed tx carries the donation.
// "declined" | "not-offered" | "passthrough" | "error": the original tx was signed.

// 4. Submitting is your job.
const signed = TransactionBuilder.fromXDR(result.signedTxXdr, Networks.TESTNET);
console.log("submitted:", (await server.submitTransaction(signed)).hash);
```

When your version infers the network from the passphrase, `network` is optional; passing it always works.

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
