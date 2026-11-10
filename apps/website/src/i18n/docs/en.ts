import { INSTALL_COMMAND, kitSnippet, soroban } from "../../lib/docs-snippets";
import type { DocsContent, FaqItem } from "./types";

const SDK_INSTALL = "pnpm add spare-sdk @stellar/stellar-sdk";

const ADD_DONATION = `import { addDonation, HorizonAccountPort } from "spare-sdk";

const result = await addDonation(unsignedTx, {
  foundation: { account: "G...", domain: "foundation.org" }, // must be listed in its stellar.toml
  amount: "0.50",            // or: roundUp: true (only when the purchase is USDC)
  appId: "my-app",           // <= 22 ASCII bytes, memo becomes "spare:my-app"
  maxAmount: "5",            // your cap per donation
  accounts: new HorizonAccountPort("https://horizon.stellar.org"),
});

switch (result.status) {
  case "offered":      // ask the user "Add US$<result.donation.amount>?", then sign result.transaction
  case "not-offered":  // sign the original tx; result.reason says why (e.g. "insufficient-balance")
  case "passthrough":  // signed / fee-bump / multisig / extra signers / Soroban: sign the original tx
}`;

const DONATE_AFTER = `import { donateAfter } from "spare-sdk";

const follow = await donateAfter(
  { successful: true, sourceAccount: userAccount, hash },
  { foundation, amount: "0.50", appId: "my-app", maxAmount: "5",
    accounts, networkPassphrase: Networks.PUBLIC },
);
if (follow.status === "offered") { /* confirm, then sign follow.transaction */ }`;

const TOML = `ACCOUNTS=["G..."]   # the foundation account registered in the Spare registry`;

export const enFaq: FaqItem[] = [
  { id: "custody", q: "Does Spare hold the money?", a: "No. Funds go from the user to the foundation in a normal Stellar payment. Spare never holds funds and takes no cut." },
  { id: "fees", q: "Who pays the fee?", a: "A classic donation is one more payment operation in the same transaction, so the transaction fee is raised by one operation. The Soroban follow-up is its own payment transaction with its own fee. Spare checks the user can cover the donation and the fee before it offers anything." },
  { id: "round-up", q: "How does round-up work?", a: "Round-up adds what it takes to reach the next whole dollar, and only when the whole transaction is a Circle-USDC purchase (payments, `pathPaymentStrictSend`, sell offers). If the amount is already whole, or the real spend is unknown up front, only a fixed amount is offered." },
  { id: "soroban", q: "Why does a Soroban call need a second signature?", a: "A Soroban transaction holds only one operation, so the donation cannot ride along. Spare sends a separate payment after the call succeeds, and the confirmation says so before the user accepts." },
  { id: "ledger", q: "What do Ledger users see?", a: "The donation is its own payment operation, so the device shows “Payment 0.50 USDC to …” before approval." },
  { id: "privacy", q: "Does the dashboard show who donated?", a: "No. The public dashboard aggregates by app and foundation and never lists donor addresses." },
  { id: "verification", q: "How is a foundation verified?", a: "A foundation registers its account in the Spare registry contract and lists the same account in the `ACCOUNTS` field of its website's `stellar.toml` (SEP-1). Nobody approves it by hand. “Domain-verified” means exactly that, nothing more." },
  { id: "declines", q: "What if the user says no, or something fails?", a: "Declining signs the original transaction, byte for byte. If a check fails (no trustline, low balance, over your cap, unverified foundation) nothing is offered, and if anything inside Spare errors the original is signed." },
];

export const enDocs: DocsContent = {
  introduction: {
    title: "Introduction",
    metaTitle: "Introduction — Spare documentation",
    lead: "Spare is an open-source kit that lets any Stellar app offer a per-transaction USDC donation at signing time. The donation goes straight to the foundation. Spare never holds funds and takes no cut.",
    blocks: [
      { t: "h2", id: "why", text: "Why" },
      { t: "p", text: "At Chilean pharmacies and supermarkets the cashier asks “¿Dona su vuelto?”: would you like to donate your change? Small amounts add up to real money for foundations. On Stellar, fees are low enough to make a US$0.50 donation worth sending, but no package lets an existing app add one at signing time." },
      { t: "h2", id: "how-it-works", text: "How it works" },
      { t: "p", text: "Before the user signs, your app asks “Add US$0.50 for [foundation]?” or “Round up to the next dollar?”. If they say yes, the donation rides along with their payment." },
      {
        t: "table",
        head: ["Transaction type", "What Spare does", "Signatures"],
        rows: [
          ["Classic (payments, path payments, any classic operation)", "Appends a USDC payment to the foundation in the same transaction. Purchase and donation succeed or fail together.", "One"],
          ["Soroban (`InvokeHostFunction`)", "A Soroban transaction can hold only one operation, so Spare sends a tagged follow-up payment after the call succeeds. The modal says so before the user accepts.", "Two"],
          ["Ledger (via Stellar Wallets Kit)", "The donation is its own payment operation, so the device shows “Payment 0.50 USDC to …” before approval.", "One"],
        ],
      },
      { t: "p", text: "Every Spare donation carries the memo `spare:<appId>`, so it is traceable on-chain and attributable to the app that sent it." },
      { t: "p", text: "Foundations verify themselves with a Stellar standard: a foundation registers its account in the Spare registry contract and lists the same account in the `ACCOUNTS` field of its website's `stellar.toml` ([SEP-1](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md)). Nobody approves it by hand." },
      { t: "h2", id: "guarantees", text: "Guarantees" },
      {
        t: "list",
        items: [
          "The user always decides. Nothing is added without an explicit yes. Declining signs the original transaction, byte for byte.",
          "No custody. Funds go from the user to the foundation in a normal Stellar payment.",
          "Circle USDC only (`GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`). Look-alike assets are rejected.",
          "Domain-verified foundations only. “Domain-verified” means the account is listed on that website's `stellar.toml`, nothing more.",
          "Never blocks a payment. If a check fails (no trustline, low balance, over your cap, unverified foundation) no donation is offered. If anything inside Spare errors, the original transaction is signed.",
          "Safe pass-through. Partly signed, multisig, fee-bump and Soroban transactions are never modified.",
          "Private by design. The public dashboard aggregates by app and foundation and never lists donor addresses.",
        ],
      },
      { t: "h2", id: "packages", text: "Packages" },
      {
        t: "table",
        head: ["Package", "Description", "Status"],
        rows: [
          ["`spare-sdk`", "Core TypeScript library: classic bundling, Soroban follow-up, eligibility checks, `stellar.toml` verification.", "Built"],
          ["`spare-wallets-kit`", "Stellar Wallets Kit wrapper with an accessible confirmation modal (EN/ES, light/dark).", "Built"],
          ["Registry contract", "Soroban foundation registry. No admin, no upgrade function, no funds.", "Built, not deployed"],
          ["Indexer and dashboard", "Registry events and tagged USDC payments, shown per foundation.", "Planned"],
        ],
      },
      { t: "h2", id: "out-of-scope", text: "Out of scope" },
      { t: "p", text: "Pooling or splitting donations, choosing or vetting charities, tax receipts, fiat on/off-ramps, and browser extensions that modify other wallets' transactions." },
    ],
  },
  "quick-start": {
    title: "Quick start",
    metaTitle: "Quick start — Spare documentation",
    lead: "Add the change-donation question to your Stellar app. This walkthrough covers installing the SDK, the wallets kit, and a first pass through the confirmation flow.",
    blocks: [
      { t: "code", code: INSTALL_COMMAND, label: "Install" },
      { t: "h2", id: "install", text: "1. Install the packages", toc: "Install" },
      { t: "p", text: "Add spare-sdk and spare-wallets-kit to your app. The kit opens confirmation in wallets such as Freighter, LOBSTR, or Ledger." },
      { t: "h2", id: "add-the-kit", text: "2. Ask at the moment of signing", toc: "Add the kit" },
      { t: "p", text: "Before they sign, show the option to add a little or round up for a foundation in the registry." },
      { t: "h3", text: "Classic transactions" },
      { t: "code", code: kitSnippet("en"), label: "Classic transactions" },
      { t: "h3", text: "Soroban calls" },
      { t: "code", code: soroban, label: "Soroban calls" },
      { t: "p", text: "Building your own interface? Use `addDonation` (classic) or `donateAfter` (Soroban) from [spare-sdk](doc:spare-sdk) directly." },
      { t: "h2", id: "try-the-flow", text: "3. Keep the registry in view", toc: "Try the flow" },
      { t: "p", text: "The gift goes straight to the foundation. The indexer and dashboard publish the movement." },
      { t: "callout", id: "next-step", title: "They decide, always.", body: "They can add a little, change the amount, or continue without giving. Spare never takes custody of the funds. The movement stays in the public registry." },
    ],
  },
  "spare-sdk": {
    title: "spare-sdk",
    metaTitle: "spare-sdk — Spare documentation",
    lead: "Add a per-transaction USDC micro-donation to any Stellar app. The donation goes straight to the foundation's account; Spare never holds funds. Circle USDC only, domain-verified foundations only.",
    blocks: [
      { t: "h2", id: "install", text: "Install" },
      { t: "code", code: SDK_INSTALL, label: "Install" },
      { t: "p", text: "`@stellar/stellar-sdk` is a peer dependency: install it next to `spare-sdk` (one copy shared with your app)." },
      { t: "h2", id: "add-donation", text: "Classic transaction: addDonation", toc: "addDonation" },
      { t: "code", code: ADD_DONATION, label: "addDonation" },
      { t: "p", text: "`offered` returns a new unsigned transaction (new hash, fee raised by one operation, memo set only if it was empty and no destination requires one). Nothing is added without the user's explicit yes." },
      { t: "h2", id: "round-up", text: "Round-up" },
      { t: "p", text: "Only when the whole transaction is a Circle-USDC purchase (payments, `pathPaymentStrictSend`, sell offers). The SDK reports what it used, so show these instead of recomputing: `donation.purchase` / `purchaseStroops` (the USDC purchase) and `roundedTotal` / `roundedTotalStroops` (purchase plus donation). They are set on round-up only." },
      { t: "list", items: ["Already whole (for example 5.00): `round-up-already-whole`.", "`pathPaymentStrictReceive`, XLM or other-asset operations, or unmodelled operations in the same transaction: `round-up-needs-usdc-purchase` (the real spend is unknown up front, so Spare never rounds `sendMax`)."] },
      { t: "h2", id: "donate-after", text: "Soroban call: donateAfter", toc: "donateAfter" },
      { t: "p", text: "A Soroban transaction holds one operation, so the donation is a separate payment after success. It needs a second signature: tell the user before they accept." },
      { t: "code", code: DONATE_AFTER, label: "donateAfter" },
      { t: "p", text: "The follow-up is a single payment (medium threshold). If the user's account needs more than its master key to sign that, nothing is offered (`multisig`)." },
      { t: "h2", id: "results", text: "Results and reason codes", toc: "Reason codes" },
      {
        t: "table",
        head: ["Status", "Meaning"],
        rows: [
          ["`offered`", "A new unsigned `transaction`, the `donation` info and the `fee`. Ask the user, then sign it."],
          ["`not-offered`", "The transaction is fine but no donation must be offered. `reason` says why. Sign the original."],
          ["`passthrough`", "Spare cannot safely modify the transaction. It is left untouched. Sign the original."],
        ],
      },
      { t: "h3", text: "passthrough reasons" },
      {
        t: "table",
        head: ["Reason", "Meaning"],
        rows: [
          ["`fee-bump`", "The transaction is a fee-bump."],
          ["`already-signed`", "The transaction already carries signatures."],
          ["`soroban`", "A Soroban transaction: use `donateAfter`."],
          ["`multiple-sources`", "More than one source account."],
          ["`multisig`", "The master key alone cannot meet the transaction's threshold: medium, or high with `setOptions` / `accountMerge`."],
          ["`extra-signers`", "The CAP-21 `extraSigners` precondition is set."],
        ],
      },
      { t: "h3", text: "not-offered reasons" },
      {
        t: "table",
        head: ["Reason", "Meaning"],
        rows: [
          ["`invalid-options`", "Options are malformed, including a malformed `baseFee`."],
          ["`invalid-app-id`", "`appId` is not valid (at most 22 ASCII bytes)."],
          ["`invalid-amount`", "The amount is not a valid USDC amount."],
          ["`invalid-foundation`", "The foundation is malformed."],
          ["`amount-over-cap`", "The donation is above your `maxAmount`."],
          ["`round-up-needs-usdc-purchase`", "Round-up needs a Circle-USDC purchase (see above)."],
          ["`round-up-already-whole`", "The purchase is already a whole amount."],
          ["`foundation-not-verified`", "The foundation account is not listed in its website's `stellar.toml`."],
          ["`foundation-trustline-missing`", "The foundation has no USDC trustline."],
          ["`foundation-trustline-unauthorized`", "The foundation's USDC trustline is not authorized."],
          ["`foundation-trustline-full`", "No room under the foundation's trustline limit."],
          ["`user-trustline-missing`", "The user has no USDC trustline."],
          ["`user-trustline-unauthorized`", "The user's USDC trustline is not authorized."],
          ["`unsupported-operation`", "The transaction has operations that can spend funds in ways Spare does not model, for example `manageBuyOffer`, `createClaimableBalance`, `liquidityPoolDeposit`, `accountMerge`."],
          ["`multisig`", "From `donateAfter` only: the follow-up needs more than the master key."],
          ["`insufficient-balance`", "Not enough USDC, or XLM for the fee plus any XLM the transaction sends."],
          ["`account-lookup-failed`", "The account could not be loaded."],
          ["`main-tx-not-successful`", "`donateAfter` only: the main transaction did not succeed."],
        ],
      },
      { t: "h2", id: "donation-info", text: "DonationInfo", toc: "DonationInfo" },
      {
        t: "table",
        head: ["Field", "Description"],
        rows: [
          ["`amount`", "Amount in USDC, 7 decimals. Show this to the user before signing."],
          ["`amountStroops`", "The same amount in stroops (`bigint`)."],
          ["`foundation`", "The foundation account."],
          ["`attributed`", "False when the transaction already had a memo, so the donation cannot be tagged for the app."],
          ["`purchase`, `purchaseStroops`", "Round-up only: the USDC purchase the transaction already makes."],
          ["`roundedTotal`, `roundedTotalStroops`", "Round-up only: the purchase plus the donation."],
        ],
      },
      { t: "h2", id: "options", text: "Options" },
      {
        t: "table",
        head: ["Option", "Description"],
        rows: [
          ["`foundation`", "`{ account, domain }`: the G... account and the bare hostname whose `stellar.toml` must list it."],
          ["`appId`", "At most 22 ASCII bytes. The memo becomes `spare:<appId>`."],
          ["`maxAmount`", "Your cap per donation, in USDC."],
          ["`accounts`", "An `AccountPort` (for example `HorizonAccountPort`)."],
          ["`fetch`", "Optional. Injectable fetch, defaults to the global one."],
          ["`baseFee`", "Optional. Per-operation fee in stroops, digits only, minimum 100."],
        ],
      },
      { t: "h2", id: "account-port", text: "Account port", toc: "AccountPort" },
      { t: "p", text: "`AccountPort.loadAccount(id)` returns an `AccountSnapshot`, or `null` when the account does not exist. `HorizonAccountPort` fills it from Horizon (`headroom` = limit - balance - buying liabilities; `memoRequired` from the `config.memo_required` data entry). Spare decides about multiple signatures from `masterWeight` and `thresholds` per transaction." },
      {
        t: "table",
        head: ["Field", "Description"],
        rows: [
          ["`sequence`", "Current sequence number (the next transaction uses sequence + 1)."],
          ["`xlmAvailable`", "XLM spendable on fees: balance minus reserve and selling liabilities."],
          ["`usdc`", "Circle-USDC trustline `{ balance, authorized, headroom }`, or `null` when there is none."],
          ["`masterWeight`", "Weight of the account's own key; 0 when it is disabled."],
          ["`thresholds`", "`{ low, medium, high }`, 0-255."],
          ["`memoRequired`", "SEP-29: the account expects a memo on incoming payments."],
        ],
      },
      { t: "h2", id: "memo-fees", text: "Memo, SEP-29 and fees", toc: "Memo and fees" },
      { t: "p", text: "If a payment, path payment or merge destination has `config.memo_required` set, Spare does not set its memo, so your app's own `checkMemoRequired` still fires. The donation is still offered, with `donation.attributed === false`. A destination that cannot be read is treated as memo-required." },
      { t: "p", text: "`baseFee` is per operation, digits only, minimum 100 stroops. A malformed value gives `not-offered` / `invalid-options`; it never throws. A transaction with a fee of 0 is raised to 100 per operation, and the same number is used for the balance check and the built transaction." },
      { t: "h2", id: "helpers", text: "Helpers" },
      {
        t: "list",
        items: [
          "`verifyFoundation(foundation)` and `listVerifiedFoundations(candidates)`: the SEP-1 `ACCOUNTS` check (https only, no redirects, 5 s timeout, body capped at 100 KB).",
          "`parseUsdc`, `formatStroops`, `roundUpToWholeDollar`: amount helpers.",
          "`isValidAppId`, `memoFor`: app id validation and the memo.",
          "`USDC_ISSUER`, `USDC_CODE`: the Circle USDC constants.",
          "Network access (`fetch`, `AccountPort`) is injectable.",
        ],
      },
    ],
  },
  "spare-wallets-kit": {
    title: "spare-wallets-kit",
    metaTitle: "spare-wallets-kit — Spare documentation",
    lead: "Add Spare to an app that signs with Stellar Wallets Kit: before each signature, the user sees “Add US$0.50 for [foundation]?” and decides. Nothing is added without an explicit yes. Spare never holds funds.",
    blocks: [
      { t: "h2", id: "install", text: "Install" },
      { t: "code", code: INSTALL_COMMAND, label: "Install" },
      { t: "h2", id: "quickstart", text: "Quickstart" },
      { t: "code", code: kitSnippet("en"), label: "withSpare" },
      { t: "p", text: "Need to know whether the hash changed? Use `signWithDonation`: it returns `{ signedTxXdr, donation, changed, outcome }`." },
      { t: "h2", id: "soroban", text: "Soroban follow-up" },
      { t: "p", text: "A Soroban transaction holds one operation, so the donation is a separate payment after your call succeeds. It needs a second signature, and the modal says so." },
      { t: "code", code: soroban, label: "offerFollowUp" },
      { t: "h2", id: "api", text: "API" },
      {
        t: "table",
        head: ["Export", "What it does"],
        rows: [
          ["`withSpare(kit, options)`", "Returns `{ signTransaction, signWithDonation, offerFollowUp, lastDonation }`."],
          ["`createConfirmModal({ locale?, theme? })`", "Default confirmation UI (vanilla DOM, shadow root). Resolves `true` only on the primary button."],
        ],
      },
      { t: "h2", id: "options", text: "Options" },
      {
        t: "table",
        head: ["Option", "Required", "Description"],
        rows: [
          ["`foundation`", "yes", "`{ account, domain }`. Domain-verified through SEP-1 `stellar.toml`."],
          ["`foundationName`", "no", "Name shown to the user. Defaults to the domain."],
          ["`mode`", "yes", "`{ amount: \"0.50\" }` or `{ roundUp: true }` (USDC purchases only)."],
          ["`appId`", "yes", "Tag for the `spare:<appId>` memo."],
          ["`maxAmount`", "yes", "Your cap per donation, in USDC."],
          ["`accounts`", "yes", "`AccountPort` from spare-sdk (for example `HorizonAccountPort`)."],
          ["`fetch`", "no", "Custom fetch for `stellar.toml` lookups."],
          ["`networkPassphrase`", "no", "Used to parse XDR when the call does not pass one. Without either, the transaction is signed unchanged."],
          ["`confirm`", "no", "`(prompt: DonationPrompt) => Promise<boolean>`. Replaces the built-in modal."],
          ["`locale` / `theme`", "no", "`\"en\" | \"es\"`; `\"light\" | \"dark\" | \"auto\"` for the built-in modal."],
          ["`wallet`", "no", "Wallet id (or getter). Defaults to `kit.selectedModule.productId`. `LEDGER` shows the “check your Ledger” note."],
          ["`followUpAmount`", "no", "Soroban follow-up amount. Defaults to the fixed `mode.amount`; required with round-up."],
        ],
      },
      { t: "h2", id: "results", text: "Results" },
      { t: "p", text: "`signWithDonation` returns `{ signedTxXdr, donation, changed, outcome, reason? }`. `outcome` is one of `donated`, `declined`, `not-offered`, `passthrough` or `error`. `donation` is null when the original transaction was signed, and `changed` is true when the signed transaction is not the one you passed in." },
      { t: "p", text: "`offerFollowUp` resolves to `{ status: \"signed\", signedTxXdr, donation }` or `{ status: \"skipped\", reason }`. Submitting is your job." },
      { t: "h2", id: "prompt", text: "DonationPrompt and custom confirm", toc: "DonationPrompt" },
      { t: "p", text: "`DonationPrompt` is `{ amount, foundationName, foundationDomain, mode: \"fixed\" | \"round-up\", wallet: \"classic\" | \"soroban\" | \"ledger\", locale, secondSignature, purchaseTotal?, roundUpTotal? }`. `purchaseTotal` and `roundUpTotal` come straight from spare-sdk's `donation.purchase` / `donation.roundedTotal`. Pass your own `confirm` to replace the modal; return `true` only on an explicit yes." },
      { t: "h2", id: "pass-through", text: "Pass-through rules", toc: "Pass-through" },
      {
        t: "list",
        items: [
          "Only unsigned, non-fee-bump, classic, single-source-signer transactions are modified. Adding an operation changes the hash and the fee, so anything else (partly signed, multisig, extra signers, fee-bump, Soroban) is signed unchanged and no donation is offered.",
          "A failed check in spare-sdk (unverified foundation, no trustline, low balance, over the cap) means no prompt and the original is signed.",
          "The user declines: the original XDR is signed, byte for byte.",
          "Any error inside Spare (bad XDR, lookup failure, confirm crashing) fails closed: the original is signed. Errors from the wallet itself, for example the user rejecting in the wallet, are not swallowed.",
        ],
      },
      { t: "h2", id: "modal", text: "Built-in modal" },
      { t: "p", text: "`role=\"dialog\"`, `aria-modal`, labelled title, focus trap, Esc skips, focus returns to the opener, `prefers-reduced-motion` respected. It shows “Domain-verified: <domain>” under the title: the foundation's `stellar.toml` lists its account, nothing more. Focus starts on the dialog, not on a button, the primary button ignores activation for the first 400 ms, and the rest of the page is `inert` while it is open. Styles live in a shadow root. Fonts (Instrument Sans, Newsreader) are not bundled: load them yourself or the system fallbacks apply." },
    ],
  },
  registry: {
    title: "Registry",
    metaTitle: "Registry — Spare documentation",
    lead: "A Soroban contract with one registry entry per foundation account. No admin, no upgrade function, no token handling, no funds. Only the foundation's own account can write its entry.",
    blocks: [
      { t: "callout", title: "Status", body: "Built and tested, not deployed yet. Built against soroban-sdk 25.3.0." },
      { t: "h2", id: "register", text: "Register a foundation" },
      { t: "p", text: "A foundation calls `register(account, name, website)` signed by its own account (`account.require_auth()`). Then it lists the same account in the `ACCOUNTS` field of its website's `stellar.toml`. Both together make it domain-verified; see [stellar.toml verification](doc:stellar-toml). Nobody approves it by hand." },
      { t: "h2", id: "functions", text: "Functions" },
      {
        t: "table",
        head: ["Function", "Auth", "Result"],
        rows: [
          ["`register(account, name, website)`", "`account`", "Creates an active entry, or reactivates a deactivated one (overwrites name and website)."],
          ["`update(account, name, website)`", "`account`", "Replaces name and website of an active entry."],
          ["`deactivate(account)`", "`account`", "Marks the entry inactive (kept in storage)."],
          ["`get(account) -> Option<Foundation>`", "none", "`Foundation { name, website, active }`."],
          ["`is_active(account) -> bool`", "none", "`false` if missing or inactive."],
        ],
      },
      { t: "p", text: "Validation is checked after auth, before storage. `name`: 1 to 64 UTF-8 bytes. `website`: 1 to 253 bytes, a bare domain with no `/` (so no scheme or path), no whitespace or control bytes. This is a format check only; domain ownership is verified off-chain via `stellar.toml` (SEP-1)." },
      { t: "h2", id: "errors", text: "Errors" },
      {
        t: "table",
        head: ["Code", "Name", "When"],
        rows: [
          ["1", "`AlreadyRegistered`", "`register` and an active entry exists."],
          ["2", "`NotFound`", "`update` or `deactivate` with no entry."],
          ["3", "`Inactive`", "`update` or `deactivate` on a deactivated entry."],
          ["4", "`InvalidName`", "Name empty or longer than 64 bytes."],
          ["5", "`InvalidWebsite`", "Website empty, longer than 253 bytes, or contains `/`, whitespace or control bytes."],
        ],
      },
      { t: "h2", id: "events", text: "Events" },
      { t: "p", text: "Topics are `[\"spare\", <kind>, account]`; data is a vec `[name, website]`. Failed calls emit nothing." },
      {
        t: "table",
        head: ["Kind", "Emitted by", "Data"],
        rows: [
          ["`register`", "`register`", "New name, website."],
          ["`update`", "`update`", "New name, website."],
          ["`deactivate`", "`deactivate`", "Last name, website."],
        ],
      },
      { t: "h2", id: "deactivation", text: "Deactivation" },
      {
        t: "list",
        items: [
          "`deactivate` keeps the entry with `active = false`; it is never deleted, so the indexer keeps history.",
          "Deactivation is reversible: `register` on a deactivated account reactivates it (name and website overwritten after the usual validation, TTL extended, normal `register` event). It needs the account's own auth.",
          "`register` on an active entry is `AlreadyRegistered`; `update` or `deactivate` on a deactivated entry are `Inactive`.",
          "Per account the indexer sees `register -> (update | deactivate -> register)*`. A `register` event for an already-known account means reactivation.",
        ],
      },
      { t: "h2", id: "ttl", text: "TTL" },
      { t: "p", text: "Entries live in persistent storage. `register` and `update` extend the TTL: the threshold is about 30 days (`30 * 17_280` ledgers) and the extension goes to about 60 days. Entries not touched for about 60 days expire; the indexer flags entries close to expiry so the foundation can call `update` to renew. `get` and `is_active` do not extend. Deactivated entries are not extended while inactive and may expire from ledger state; reactivating an expired entry is a fresh `register`." },
    ],
  },
  "indexer-dashboard": {
    title: "Indexer and dashboard",
    metaTitle: "Indexer and dashboard — Spare documentation",
    lead: "The public record of what foundations receive through Spare.",
    blocks: [
      { t: "planned", title: "Planned", body: "The indexer and the dashboard are not built yet. This page describes what they will do, and will change as they ship." },
      { t: "h2", id: "indexer", text: "Indexer" },
      { t: "p", text: "Ingests registry events and tagged USDC payments, and can be rebuilt from Horizon. Donations are attributed to an app through the `spare:<appId>` memo; a donation that could not be tagged (`donation.attributed === false`) cannot be attributed to an app." },
      { t: "h2", id: "dashboard", text: "Dashboard" },
      { t: "p", text: "Public per-foundation pages with totals, apps and transaction links. It aggregates by app and foundation and never lists donor addresses." },
    ],
  },
  "stellar-toml": {
    title: "stellar.toml verification",
    metaTitle: "stellar.toml verification — Spare documentation",
    lead: "Spare only works with domain-verified foundations. Verification uses a Stellar standard, SEP-1, so nobody approves a foundation by hand.",
    blocks: [
      { t: "h2", id: "how", text: "How a foundation verifies" },
      { t: "p", text: "The foundation registers its account in the Spare registry contract and lists the same account in the `ACCOUNTS` field of its website's `stellar.toml` ([SEP-1](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md))." },
      { t: "code", code: TOML, label: "stellar.toml" },
      { t: "h2", id: "checks", text: "What Spare checks" },
      {
        t: "list",
        items: [
          "The `stellar.toml` is fetched over https only.",
          "No redirects are followed.",
          "The request has a 5 second timeout.",
          "The body is capped at 100 KB (checked on Content-Length and while streaming).",
          "The foundation account must appear in `ACCOUNTS`. SDK, indexer and dashboard each re-check it.",
        ],
      },
      { t: "h2", id: "meaning", text: "What “domain-verified” means" },
      { t: "p", text: "It means exactly that: the account is listed on that website's `stellar.toml`. It is not an endorsement, a vetting of the charity or a guarantee about how the foundation uses the funds." },
    ],
  },
  faq: {
    title: "FAQ",
    metaTitle: "FAQ — Spare documentation",
    lead: "Short answers about custody, fees, round-up, signatures and privacy.",
    blocks: [{ t: "faq" }],
  },
};
