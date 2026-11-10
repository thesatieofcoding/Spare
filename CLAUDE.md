# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Greenfield. pnpm workspace with `packages/spare-sdk` + `packages/spare-wallets-kit` (TypeScript, ESM, vitest, strict TDD) plus Cargo workspace `contracts/*` (`contracts/registry`, crate `spare-registry`, soroban-sdk pinned `=25.3.0` for rustc 1.90).

```
pnpm install                                                      # once
pnpm test                                                         # all packages (pnpm -r test)
pnpm typecheck                                                    # all packages
pnpm -C packages/spare-sdk exec vitest run test/add-donation.test.ts   # single file
pnpm -C packages/spare-wallets-kit test                           # wallets-kit (vitest + happy-dom; spare-sdk resolved from source)
pnpm -C packages/spare-sdk exec vitest run -t "round-up"               # single test by name
cargo test -p spare-registry                                      # registry contract tests
cargo test -p spare-registry duplicate_register_rejected          # single contract test by name
```

SDK layout: pure domain (`amount`, `app-id`, `spend`, `eligibility`, `add-donation`, `donate-after`) behind ports in `ports.ts` (`AccountPort`, `FetchLike`); adapters in `horizon.ts` and `stellar-toml.ts`. Unit tests use fakes, no network. Results are discriminated unions (`offered` / `not-offered` + reason / `passthrough` + reason); ineligible input never throws. `spare-wallets-kit`: `withSpare` (container: parse -> `addDonation` -> injectable `confirm` -> sign original or modified; fails closed) + `createConfirmModal` (shadow-DOM presentational).

**Do not push to GitHub, open PRs, create remote repos, or publish to npm until the user explicitly asks.**

## What Spare is

Open-source kit that lets any Stellar app offer a per-transaction USDC micro-donation ("Add US$0.50 for [foundation]?" / "Round up?") at signing time. Donation goes straight to the foundation's Stellar account. Spare never holds funds, takes no cut. 30-day Instawards sprint (SOW is the source of truth for scope and acceptance evidence).

## Planned components (from SOW)

1. **`spare-sdk`** (TypeScript, npm)
   - `addDonation(tx, { foundation, amount | roundUp, appId })` — appends a payment op to a **classic** tx, raises fee for the extra op, sets memo `spare:<appId>` if memo is free.
   - `donateAfter(result, …)` — **Soroban** path: `InvokeHostFunction` tx can hold only one op, so donation is a separate follow-up payment after success (second signature; UI must say so before user accepts).
   - Helpers: list domain-verified foundations, check `stellar.toml`.
2. **`spare-wallets-kit`** — wraps Stellar Wallets Kit `signTransaction`, inserts confirmation step before signing.
3. **Demo app** — classic payment + donation, and Soroban call + follow-up donation.
4. **Registry contract** (Soroban) — `register(account, name, website)`, `update`, `deactivate`; auth = foundation's own account only. One entry per account. No admin, no upgrade fn, no funds. `register`/`update` extend storage TTL; indexer flags entries near expiry.
5. **Indexer** — ingests registry events + USDC payments to registered foundations via RPC `getEvents` (unified events, Protocol 23+), reads memo via `getTransaction`. RPC retention ~7 days → indexer must persist full history; rebuild script replays from Horizon (`/accounts/{foundation}/payments` + tx memo) or Hubble, **never RPC**.
6. **Public dashboard** — baseline: static page per foundation generated from indexer (total via Spare, count, apps, unattributed shown apart, tx links). Live auto-refresh is stretch.

## Hard invariants (enforce in code + tests)

- Only USDC issued by Circle: `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`. Reject anything else.
- Only **domain-verified** foundations: registry account must appear in `ACCOUNTS` of the foundation website's `stellar.toml` (SEP-1). SDK, indexer and dashboard all re-check. "Domain-verified" means exactly that, nothing more.
- Before offering a donation: foundation has an **authorized** USDC trustline; user has USDC trustline; user balance covers donation (+ purchase if purchase is USDC) + fee. Any check fails → offer nothing.
- Round-up only when the purchase is in USDC; otherwise fixed amount only. Enforce app-set max cap.
- `appId` ≤ 22 ASCII bytes (memo `spare:` + appId must fit 28-byte text memo).
- Wrapper modifies only **unsigned, non-fee-bump, classic, single-source-signer** txs. Anything else (partly signed, multisig, fee-bump) passes through unchanged, no donation offered. Adding an op changes hash and fee — that's why.
- Nothing added without explicit per-tx yes (or user-toggled setting they can turn off). Amount shown in USDC before signing.
- Indexer attributes donations **only** from the `spare:<appId>` memo tag; untagged payments to foundations = "unattributed".
- Dashboard never lists donor addresses (aggregates by app + foundation; tx links only).

## Required CI test coverage (from SOW)

SDK: op building (append, fee, memo, round-up math); rejects unverified foundation, non-Circle USDC, amount over cap, missing/deauthorized foundation trustline, insufficient balance; pass-through of partly signed / multisig / fee-bump; Soroban follow-up flow.
Contract: auth (only self can register/update/deactivate), duplicate registration.
Indexer: attribution against fixture txs incl. untagged payments.

Releases: npm with provenance from GitHub Actions. Contract source verified via stellar-expert `soroban-build-workflow`.

## Out of scope

Pooling/splitting donations, vetting charities, tax receipts, browser extension modifying other wallets, fiat ramps / CLP conversion, marketing.

## Design (Figma)

File: `https://www.figma.com/design/LYJSOcS6pe7XMTANr5BWKx/SPARE---Design` — key `LYJSOcS6pe7XMTANr5BWKx`.
Pages: `01 · Brand` (6:2), `02 · Design system` (17:56), `03 · Website` (17:57), `04 · Social` (17:58). Ignore `99 · Archive`.

**Website** (17:57): 5 pages — Home, Docs, Foundations (directorio), Dashboard (tablero), Demo. Every page exists in **ES + EN**, **Light + Dark**, **Desktop 1440 + Mobile 390** (plus Home mobile open-menu state). i18n and theming are first-class, not afterthoughts.

**Tokens** (Figma variables: primitives in `Spare / primitives`, semantics in `Spare / color` with Light/Dark modes):
- Semantic names: `bg/page`, `surface`, `field`, `accent`, `text/primary`, `text/secondary`, `on-accent`, `on-band`. Use semantic tokens in code, not raw hex.
- Key: field `salvia/400 #B7CDB0`, accent `salvia/700 #3E6650`, cream `cream/75 #FBF7EE`, ink `neutral/800 #2C2B2B`, forest `forest/800 #1A221D`, accent-dark `salvia/500 #A9C7A6`, error `error/500 #8F4A3A`.
- Dark mode: page = forest, accent = salvia/500, text = cream, on-accent = ink.
- Spacing 4px scale (4…80). Radius 8 / 16 / full(999). Buttons + search pill = full; cards 8 or 16; modals 16.
- Accent is Salvia (`salvia/700 #3E6650`), confirmed by user. Some Figma annotations still mention olive `#3F522C` — stale, ignore.

**Type**: Newsreader (titles, amounts, captions; Medium / Medium Italic / Italic) + Instrument Sans (UI, body, buttons, nav, wordmark; Regular / Medium). Desktop min 14px. Buttons sentence case. Mono only in real code blocks. Scale: H1 48/56, H2 32/40, H4 22/28, Body M 16/24, Body S / Label / Button 14/20.

**Components** (in 02 · Design system): Button (Primary/Secondary × Default/Hover/Pressed/Focus/Disabled — one primary per view, accent only on primary), Link, Nav item, Language switcher, Search pill, Domain-verified badge (static, no hover), Dashboard stat, Transaction row (no donor addresses), Toast, Foundation card, Chip, Nav Desktop/Mobile, Footer, Credibility strip, **Confirmation modal** (Amount = Fixed | Round-up × Wallet = Classic | Soroban "needs a second signature" | Ledger "confirm on the device").

**Brand rules**: only the official mark (rings-and-person), never redrawn/outlined/stacked. Wordmark "spare" is live text in Instrument Sans Medium, ≥20px. Mark recolors only ink (light) or cream `#F5F0E6` (dark). Clearspace = ¼ mark height. Illustrations: only the 7 official assets as full cutouts — no new AI images, no stock, no circle masks.
