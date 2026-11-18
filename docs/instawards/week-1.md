# Week 1 — Nov 9–13, 2026

Spare is an open-source kit that lets any Stellar app offer a small USDC donation at signing time ("Add US$0.50 for [foundation]?"). The donation goes straight to the foundation's own Stellar account; Spare never holds funds and takes no cut.

## Summary

This week we built the core: the `spare-sdk` that adds a tagged donation to a classic transaction, the Stellar Wallets Kit wrapper that asks the user before signing, the foundation registry contract, the website with docs, and the first npm release with provenance.

## Added

- **`spare-sdk`**: `addDonation(tx, …)` appends a USDC payment to an unsigned classic transaction, raises the fee for the extra operation and sets the memo `spare:<appId>` when the memo is free. Includes round-up math, an app-set maximum, and the safety checks: Circle USDC only, the foundation listed in its own `stellar.toml` (domain-verified), the foundation's USDC trustline authorized, the user's trustline and balance enough. If any check fails, nothing is offered. Partly signed, multisig and fee-bump transactions pass through unchanged.
- **`spare-wallets-kit`**: `withSpare` wraps the kit's `signTransaction` and shows a confirmation step (amount in USDC) before signing. It fails closed: on any error the original transaction is signed.
- **Registry contract** (Soroban, `contracts/registry`): `register`, `update`, `deactivate`, `get`, `is_active`. Only the foundation's own account can change its entry, one entry per account, no admin, no upgrade function, no funds.
- **Website** [donatespare.xyz](https://donatespare.xyz/) with home and docs, in English and Spanish, light and dark.
- **npm** packages [`spare-sdk`](https://www.npmjs.com/package/spare-sdk) and [`spare-wallets-kit`](https://www.npmjs.com/package/spare-wallets-kit) 0.1.1, published from GitHub Actions with provenance.
- **CI** on every push: SDK, wrapper and contract tests.

## Progress vs. plan

- Goal: SDK appends a tagged donation to a classic testnet payment, tests green in CI → **done**.
- Goal: registry contract written with tests → **done** (auth and duplicate registration covered).
- Goal: request the human review of the contract → **moved to week 2** (filed as [issue #15](https://github.com/thesatieofcoding/Spare/issues/15)).

## Blockers and lessons

- The registry has no upgrade function on purpose, so it has to be right before mainnet. We decided to harden it (storage TTL, input validation) before asking for the review.
- The Soroban follow-up donation needs a second signature; it moved to week 2 together with the demo app.

## Next week

- Soroban follow-up donation flow, demo app with classic and Soroban flows.
- Test signing with real wallets and run both flows on mainnet.
- Timed quickstart run from an empty folder.

## Links

- Repository: https://github.com/thesatieofcoding/Spare
- Video: _added when published_
- Post on X: _added when published_
- Commits: https://github.com/thesatieofcoding/Spare/commits/main
