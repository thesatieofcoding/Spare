<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.png">
  <img alt="Spare — Add a little, or skip. Open source micro-donations on Stellar." src="docs/assets/hero-light.png">
</picture>

<h1 align="center">spare</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/spare-sdk"><img alt="spare-sdk on npm" src="https://img.shields.io/npm/v/spare-sdk?label=spare-sdk&color=3E6650"></a>
  <a href="https://www.npmjs.com/package/spare-wallets-kit"><img alt="spare-wallets-kit on npm" src="https://img.shields.io/npm/v/spare-wallets-kit?label=spare-wallets-kit&color=3E6650"></a>
  <a href="https://github.com/thesatieofcoding/Spare/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/thesatieofcoding/Spare/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/spare-sdk#provenance"><img alt="npm provenance" src="https://img.shields.io/badge/npm-provenance-3E6650"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-3E6650"></a>
  <a href="https://donatespare.xyz"><img alt="Website" src="https://img.shields.io/badge/website-donatespare.xyz-3E6650"></a>
</p>

<p align="center">
  <strong>Add a little, or skip.</strong><br>
  An open-source kit that lets any Stellar app offer a per-transaction USDC donation at signing time.<br>
  The donation goes straight to the foundation. Spare never holds funds and takes no cut.
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#guarantees">Guarantees</a> ·
  <a href="#packages">Packages</a> ·
  <a href="#development">Development</a>
</p>

---

## Why

At Chilean pharmacies and supermarkets the cashier asks *"¿Dona su vuelto?"* — would you like to donate your change? Small amounts add up to real money for foundations.

On Stellar, fees are low enough to make a US$0.50 donation worth sending, but no package lets an existing app add one at signing time. Today a user who wants to give has to leave the app, find a foundation and send a second payment.

Spare is that missing package. Before the user signs, your app asks **"Add US$0.50 for [foundation]?"** or **"Round up to the next dollar?"**. If they say yes, the donation rides along with their payment.

## How it works

<p align="center">
  <img src="docs/assets/confirmation-modal.png" width="420" alt="Spare confirmation modal: Add US$0.50 for Cooperative? with Add US$0.50 and Not now buttons">
</p>

| Transaction type | What Spare does | Signatures |
| --- | --- | --- |
| **Classic** (payments, path payments, any classic op) | Appends a USDC payment to the foundation **in the same transaction**. Purchase and donation succeed or fail together. | One |
| **Soroban** (`InvokeHostFunction`) | A Soroban tx can hold only one operation, so Spare sends a tagged follow-up payment after the call succeeds. The modal says so before the user accepts. | Two |
| **Ledger** (via Stellar Wallets Kit) | The donation is its own payment operation, so the device shows *"Payment 0.50 USDC to …"* before approval. | One |

Every Spare donation carries the memo `spare:<appId>`, so it is traceable on-chain and attributable to the app that sent it.

**Foundations verify themselves** with a Stellar standard: a foundation registers its account in the Spare registry contract and lists the same account in the `ACCOUNTS` field of its website's `stellar.toml` ([SEP-1](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md)). Nobody approves it by hand.

## Quickstart

Already signing with Stellar Wallets Kit? Wrap it:

```ts
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { HorizonAccountPort } from "spare-sdk";
import { withSpare } from "spare-wallets-kit";

const network = "testnet"; // "mainnet" in production

const spare = withSpare(StellarWalletsKit, {
  foundation: { account: "G...", domain: "foundation.org" }, // listed in its stellar.toml
  foundationName: "Tellus Cooperative",
  mode: { amount: "0.50" },          // or { roundUp: true } for USDC purchases
  appId: "my-app",                   // memo becomes "spare:my-app"
  maxAmount: "5",                    // your cap per donation
  accounts: new HorizonAccountPort({ network }),
  network,
});

// Drop-in replacement for kit.signTransaction
const { signedTxXdr } = await spare.signTransaction(xdr, { address });
```

Building your own UI? Use [`spare-sdk`](packages/spare-sdk) directly: `addDonation(tx, opts)` for classic transactions and `donateAfter(result, opts)` for Soroban calls.

## Guarantees

- **The user always decides.** Nothing is added without an explicit yes. Declining signs the original transaction, byte for byte.
- **No custody.** Funds go from the user to the foundation in a normal Stellar payment.
- **Foundations receive Circle USDC only** (`GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`). Look-alike assets are rejected. A donor may pay in XLM; a path payment converts it so the foundation still receives exactly the USDC amount shown.
- **Domain-verified foundations only.** "Domain-verified" means the account is listed on that website's `stellar.toml` — nothing more.
- **Never blocks a payment.** If a check fails (no trustline, low balance, over your cap, unverified foundation) no donation is offered. If anything inside Spare errors, the original transaction is signed.
- **Safe pass-through.** Partly signed, multisig, fee-bump and Soroban transactions are never modified.
- **Private by design.** The public dashboard aggregates by app and foundation and never lists donor addresses.

## Packages

| Package | Description | Status |
| --- | --- | --- |
| [`spare-sdk`](packages/spare-sdk) | Core TypeScript library: classic bundling, Soroban follow-up, eligibility checks, `stellar.toml` verification, donations paid in USDC or XLM (path payment; the foundation always receives USDC). | ✅ [npm](https://www.npmjs.com/package/spare-sdk) |
| [`spare-wallets-kit`](packages/spare-wallets-kit) | Stellar Wallets Kit wrapper with an accessible confirmation modal (EN/ES, light/dark, amount picker). | ✅ [npm](https://www.npmjs.com/package/spare-wallets-kit) |
| [`contracts/registry`](contracts/registry) | Soroban foundation registry. No admin, no upgrade function, no funds. | ✅ Built · testnet · mainnet pending (D2) |
| [`apps/website`](apps/website) | Site, docs and demo (Astro, EN/ES, light/dark). | ✅ [donatespare.xyz](https://donatespare.xyz) |
| Demo app | Classic payment + donation and Soroban call + follow-up, on testnet and mainnet. | ✅ [donatespare.xyz/demo](https://donatespare.xyz/demo/) |
| Indexer | Ingests registry events and tagged USDC payments; rebuildable from Horizon. | 🔜 D2 |
| Dashboard | Public per-foundation pages with totals, apps and transaction links. | 🔜 D2 |

## Deliverable 1 evidence

| SOW evidence | Link |
| --- | --- |
| Both packages on npm with READMEs and a quickstart | [`spare-sdk`](https://www.npmjs.com/package/spare-sdk) · [`spare-wallets-kit`](https://www.npmjs.com/package/spare-wallets-kit) · [Quick start](https://donatespare.xyz/docs/quick-start/) |
| npm releases published with provenance from GitHub Actions | [Release v0.1.4](https://github.com/thesatieofcoding/Spare/actions/runs/43610287959) · [`release.yml`](.github/workflows/release.yml) |
| Green CI run | [CI on `main`](https://github.com/thesatieofcoding/Spare/actions/runs/43610277836) |
| Demo app live | [donatespare.xyz/demo](https://donatespare.xyz/demo/) |
| Mainnet: classic payment with the donation in the same transaction (signed with Varial) | [`557f7fd0…`](https://stellar.expert/explorer/public/tx/557f7fd054207f9ab4100a0186685cce7c46e4a7038b073478e528ad7c7296f1) · also signed with Ledger: [`d711eeca…`](https://stellar.expert/explorer/public/tx/d711eeca1649aebdefb3d45a6be33bf11788f82ba75356dd9f8958bd78d4e337) |
| Mainnet: Soroban call + tagged follow-up donation (signed with Ledger) | Call [`ca399e81…`](https://stellar.expert/explorer/public/tx/ca399e816de25ebb52d304d1b89ea029d2d5a1939e636f31939a3847302bd04a) · Donation [`229f1e84…`](https://stellar.expert/explorer/public/tx/229f1e849a3d105bf5ddaac2f248c1da88ba95f59f79f7d4659b05d7e75299d8) |
| Mainnet screen recording through the wrapper (classic with Varial, Soroban with Ledger) | [Classic (Varial)](https://github.com/thesatieofcoding/Spare/releases/download/d1-evidence/d1-mainnet-classic-varial.mp4) · [Soroban (Ledger)](https://github.com/thesatieofcoding/Spare/releases/download/d1-evidence/d1-mainnet-soroban-ledger.mp4) · [Narrated walkthrough, both flows, EN subtitles](https://github.com/thesatieofcoding/Spare/releases/download/d1-evidence/d1-mainnet-demo.mp4) · [all recordings](https://github.com/thesatieofcoding/Spare/releases/tag/d1-evidence) |
| Testnet: classic payment + donation signed with Varial through the wrapper | [`1600fea1…`](https://stellar.expert/explorer/testnet/tx/1600fea12c8ad8dbb2fd59ee95642171f08b08c6236a1031becdcc41b8a05db9) |
| Testnet: Soroban call + follow-up donation signed with Varial through the wrapper | Call [`dd286449…`](https://stellar.expert/explorer/testnet/tx/dd28644933c0cc06f9c0cceac5b3b1eb6539a4282195a2f4a0ad23057af01c11) · Donation [`bc2c73ec…`](https://stellar.expert/explorer/testnet/tx/bc2c73ecb1499d5a51509c1562bbaf538e382aeb9f00812aaf4053b299aa2fb4) |
| Timed quickstart run on testnet, from an empty folder using the quick start alone (agent run by Claude Code, authorized by [@Klorenn](https://github.com/Klorenn)) | Empty folder to donation in **1 min 29 s** (2026-11-14 17:33:17Z → 17:34:46Z), following [Quick start](https://donatespare.xyz/docs/quick-start/) only · Donation [`ffd09cb9…`](https://stellar.expert/explorer/testnet/tx/ffd09cb9e407850430163eeb4ab226c9d401a37016add8d9507c64f816519a32) (1 XLM payment + 0.50 USDC to the demo foundation, memo `spare:quickstart`) · [Recording](https://github.com/thesatieofcoding/Spare/releases/download/d1-evidence/d1-quickstart-agent-run-testnet.mp4) ([asciinema cast](https://github.com/thesatieofcoding/Spare/releases/download/d1-evidence/d1-quickstart-agent-run-testnet.cast)) |

Wallets used on mainnet: Varial (classic) and Ledger (classic and Soroban), both through Stellar Wallets Kit. Any wallet in the kit works the same way; LOBSTR was not used.

Accounts: mainnet foundation `GBTDED5SE2QAKFQ3Y6NY75QGCKQTQ3Z6H3ZYM4PWUX3X36QMOKEEJFPQ` (domain-verified via [`stellar.toml`](https://donatespare.xyz/.well-known/stellar.toml); demo donations return to the builder), demo merchant `GAKPFMRQLR25DIFUIDWDJ4P6D7VGUSLNBWVNWA5OKA72M4LPUKTDHLUX`, Ledger payer `GDXCVX4JSUVS3JZFOWAVBNWAV4HLO3H4GF7ES3WDN7DEOLPTX4M5YF72`, Varial payer `GCLIUGHWZK75INDCRXQJDMYWZ2VKMLJPUHQHUU2A7FNBKSZJGQF5DGPN`.

## Development

Requirements: Node 20+, pnpm 10, Rust (stable) for the contract.

```bash
pnpm install                                   # install workspace
pnpm test                                      # all TypeScript tests
pnpm typecheck                                 # strict type check
pnpm -C packages/spare-sdk exec vitest run test/amount.test.ts   # one file
pnpm -C packages/spare-sdk exec vitest run -t "round-up"         # by test name
cargo test -p spare-registry                   # contract tests
```

```
packages/
  spare-sdk/            core library
  spare-wallets-kit/    Wallets Kit wrapper + confirmation modal
contracts/
  registry/             Soroban foundation registry
docs/assets/            README visuals (exported from the Figma design)
```

## Out of scope

Pooling or splitting donations, choosing or vetting charities, tax receipts, fiat on/off-ramps, and browser extensions that modify other wallets' transactions.

## License

MIT
