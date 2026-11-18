# Week 2 — Nov 14–20, 2026

Spare lets any Stellar app offer a small USDC donation at signing time. The donation goes straight to the foundation's account; Spare never holds funds and takes no cut.

## Summary

Deliverable 1 is done and running on mainnet: a classic payment with the donation in the same transaction, and a Soroban call with a follow-up donation, both signed with real wallets (Varial and Ledger) through the wrapper. We also started Deliverable 2: the hardened registry has a verified build ready for mainnet, and the indexer and public dashboard are built.

## Added

- **Demo app** [donatespare.xyz/demo](https://donatespare.xyz/demo/): classic payment + donation, and Soroban call + follow-up donation (the UI says before signing that it needs a second signature).
- **Soroban path** `donateAfter`: the donation is a separate payment after the Soroban transaction succeeds, because a Soroban transaction holds only one operation.
- **Pay the donation in XLM**: the foundation still receives exact USDC (strict-receive path payment); the price is re-quoted at confirmation and capped.
- **Amount choices** in the confirmation modal: presets, custom amount, pay asset.
- **npm** releases 0.1.2, 0.1.3 and 0.1.4 with provenance.
- **Mainnet evidence**: classic [`557f7fd0…`](https://stellar.expert/explorer/public/tx/557f7fd054207f9ab4100a0186685cce7c46e4a7038b073478e528ad7c7296f1) (Varial), Soroban call [`ca399e81…`](https://stellar.expert/explorer/public/tx/ca399e816de25ebb52d304d1b89ea029d2d5a1939e636f31939a3847302bd04a) + donation [`229f1e84…`](https://stellar.expert/explorer/public/tx/229f1e849a3d105bf5ddaac2f248c1da88ba95f59f79f7d4659b05d7e75299d8) (Ledger), screen recordings and a narrated walkthrough. Full list in the [Deliverable 1 evidence map](https://github.com/thesatieofcoding/Spare#deliverable-1-evidence).
- **Timed quickstart run**: empty folder to a testnet donation in **1 min 29 s** using only the [quick start](https://donatespare.xyz/docs/quick-start/) (hypothesis: under 30 minutes).
- **Indexer** (`packages/spare-indexer`): reads registry events and USDC payments, counts only Circle USDC to domain-verified foundations, attributes donations only from the `spare:<appId>` memo, keeps untagged payments apart as "unattributed", and never stores donor addresses. Rebuilds from Horizon, so the ~7-day RPC retention loses nothing. Runs every 3 hours from GitHub Actions and writes to the `data` branch.
- **Foundations and Dashboard pages** in English and Spanish, built from the indexer snapshot.
- **Registry release `registry-v0.1.1`**: verified build (SEP-55) with build attestation, ready to deploy.
- **Human review request** for the registry: [issue #15](https://github.com/thesatieofcoding/Spare/issues/15).

## Changed

- Registry hardened before mainnet: storage TTL extends to the network maximum, website must be a real hostname (no IPs), names reject control, bidi and zero-width characters.
- CI: pinned Rust toolchain, all GitHub Actions pinned to commit SHAs, a check that the contract exports only its five functions.

## Fixed

- Demo shows the donation as "US$0.50" instead of stroop precision.
- Four issues found by a pre-merge review of the indexer, fixed with tests: contract-address registrations could stall it, unverified accounts were read before verification, a pagination edge case, and the workflow's write token stayed on disk.

## Progress vs. plan

- Goal: Soroban flow, wrapper and demo on testnet, real wallet, both packages on npm → **done, and on mainnet**.
- Goal (week 3 plan, started early): indexer and dashboard → **built**; registry on mainnet → **verified build ready, deploy pending**.
- Tests: 246 SDK, 102 wrapper, 156 indexer, 291 website, 43 contract, all green in CI.

## Blockers and lessons

- The human review of the contract has not come in yet. The plan says that if it is not in by day 20, the registry deploys labelled "unreviewed" and the review follows.
- The mainnet registry deploy needs the demo foundation to sign its own registration, so it is a manual step with its wallet.
- A review before each merge paid off: it caught the indexer issues above before they reached production.

## Next week

- Deploy the registry on mainnet and register the demo foundation.
- First indexer run on mainnet; the dashboard shows the foundation and its donations.
- Demo at `demo.donatespare.xyz`.

## Links

- Video: https://github.com/thesatieofcoding/Spare/releases/download/d1-evidence/d1-mainnet-demo.mp4
- Post on X: _added when published_
- Commits: https://github.com/thesatieofcoding/Spare/commits/main
