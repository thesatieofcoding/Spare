# Deliverable 2 runbook: registry to mainnet, indexer and dashboard live

Ordered operator steps. Nothing here is run by an agent: every step marked **Maintainer** needs the maintainer's keys, accounts or GitHub permissions. No secret or private key belongs in this file or in the repository; use key aliases (`<FOUNDATION_KEY_ALIAS>`, `<DEPLOYER_KEY_ALIAS>`) created with `stellar keys`.

Commands marked `# verify` use CLI flags that were not exercised against mainnet while writing this runbook; check them against `--help` of your installed version first.

Repository: `thesatieofcoding/Spare`. Placeholders: `<CONTRACT_ID>`, `<FOUNDATION_ACCOUNT>` (the G address of the demo foundation), `<DEPLOY_LEDGER>`.

## Gate: human review before any mainnet deployment

Do not deploy the registry to mainnet before this gate is resolved.

- Review request: https://github.com/thesatieofcoding/Spare/issues/15 (human review of the registry contract). Check it first; the issue must be open with the contract source linked.
- If the review is done and its findings are fixed or accepted in writing on the issue: continue with step 1.
- If there is no review by **day 20** of the sprint (SOW rule): deploy anyway, label the contract **unreviewed** in `README.md` (next to the registry contract id in the Deliverable 2 evidence table and in `contracts/registry/README.md`), and publish the review as a follow-up when it arrives. Record the decision as a comment on issue #15 before step 1.

Who: **Maintainer**.

## 1. Upgrade stellar-cli (Maintainer)

Mainnet runs protocol 29. An older CLI cannot simulate or submit transactions correctly.

```
stellar --version
brew upgrade stellar-cli      # or: cargo install --locked stellar-cli
stellar --version
```

Confirm the new version supports the network: `stellar network ls` should list `mainnet` (add it with `stellar network add` if not; the RPC URL is the same as the `SPARE_RPC_URL` secret).

## 2. Bump the crate version and tag the release (Maintainer)

The WASM file is named from the crate version, not the tag, so bump `version` in `contracts/registry/Cargo.toml` first (currently `0.1.0`; next is `0.1.1`) and merge it to `main`.

```
git tag registry-v0.1.1
git push origin registry-v0.1.1
```

`.github/workflows/registry-release.yml` triggers on `registry-v*`: it tests, builds the optimized WASM with stellar-expert's `soroban-build-workflow` (pinned by SHA), publishes a GitHub release with the WASM, attests it and registers the build for contract validation. Wait until the workflow is green and the release exists:

```
gh run list --repo thesatieofcoding/Spare --workflow registry-release.yml --limit 3
gh release view registry-v0.1.1 --repo thesatieofcoding/Spare
```

Failure: fix on `main`, bump to the next patch (`registry-v0.1.2`), tag again. Never deploy a locally built WASM: its hash will not match the verified build.

## 3. Download and check the release WASM (Maintainer)

```
mkdir -p /tmp/spare-registry-release && cd /tmp/spare-registry-release
gh release download registry-v0.1.1 --repo thesatieofcoding/Spare --pattern '*.wasm'
stellar contract info meta --wasm spare-registry_v0.1.1.wasm        # source_repo, home_domain
gh attestation verify spare-registry_v0.1.1.wasm --repo thesatieofcoding/Spare
```

The attestation check needs the repository to be public. The exact WASM file name comes from the release assets; adjust the commands if it differs (`# verify`).

## 4. Deploy the registry to mainnet (Maintainer)

```
stellar contract deploy \
  --wasm spare-registry_v0.1.1.wasm \
  --source-account <DEPLOYER_KEY_ALIAS> \
  --network mainnet \
  --alias spare-registry          # verify
```

Record the printed contract id (`<CONTRACT_ID>`) and the ledger of the deploy transaction. The ledger is in the transaction on Horizon (`ledger` field):

```
curl -s https://horizon.stellar.org/transactions/<DEPLOY_TX_HASH> | jq .ledger
```

Note both values for the evidence table. The contract has no admin and no upgrade function, so a wrong deploy cannot be fixed in place: if the deployed WASM is wrong, abandon the id and deploy again from step 3 (the indexer only reads ids listed in its config).

## 5. Register the demo foundation (Maintainer, foundation key)

Only the foundation's own account can register itself, so this transaction is signed by the foundation key. Before running it, the account must be listed in `ACCOUNTS` of the foundation website's `stellar.toml` (the indexer and dashboard re-check it).

Signatures from `contracts/registry/src/lib.rs`: `register(account: Address, name: String, website: String)`. `website` is a bare hostname (no scheme, no `/`); `name` is at most 64 bytes.

```
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source-account <FOUNDATION_KEY_ALIAS> \
  --network mainnet \
  -- register \
  --account <FOUNDATION_ACCOUNT> \
  --name "<FOUNDATION_NAME>" \
  --website "<FOUNDATION_DOMAIN>"
```

Verify: `stellar contract invoke --id <CONTRACT_ID> --source-account <FOUNDATION_KEY_ALIAS> --network mainnet -- is_active --account <FOUNDATION_ACCOUNT>` prints `true` (`# verify` for the read-only form; `--send=no` may be needed). Record the ledger of the register transaction.

Errors map to contract error codes: `AlreadyRegistered`, `InvalidName`, `InvalidWebsite` (see `contracts/registry/README.md`).

## 6. Configure the indexer (Maintainer, PR to main)

Edit `packages/spare-indexer/indexer.config.json`, section `mainnet`:

```json
{
  "mainnet": {
    "registryContracts": ["<CONTRACT_ID>"],
    "startLedger": <DEPLOY_LEDGER>,
    "seedAccounts": []
  }
}
```

`startLedger` is the deploy ledger (registry events start there). `seedAccounts` is only needed for foundations whose payments predate their registration and cannot be recovered from events; each entry is `{ "account", "contractId", "name", "website", "fromLedger" }`. Leave it empty for the demo foundation unless pre-registration donations must be counted.

Until this file has a non-empty `registryContracts`, `index` and `rebuild` on mainnet exit 3. Merge to `main`.

## 7. Repository secrets and variable (Maintainer)

The `data` branch already exists (empty mainnet snapshot). The workflow `.github/workflows/indexer.yml` pushes only to `data`.

```
gh secret set SPARE_RPC_URL --repo thesatieofcoding/Spare                 # prompts for the value
gh secret set VERCEL_DEPLOY_HOOK_URL --repo thesatieofcoding/Spare        # optional: rebuild the website when data changes
gh variable set SPARE_INDEXER_ENABLED --body true --repo thesatieofcoding/Spare
```

Create the deploy hook in Vercel (Project settings, Git, Deploy Hooks, branch `main`). The hook is a secret: never commit it.

## 8. First indexer runs (Maintainer)

RPC keeps only about 7 days of history, so run within 7 days of the deploy. Start with a rebuild (replays Horizon, never RPC; also sets the RPC cursor), then an incremental index:

```
gh workflow run indexer.yml --repo thesatieofcoding/Spare -f mode=rebuild
gh run watch --repo thesatieofcoding/Spare                      # pick the run
gh workflow run indexer.yml --repo thesatieofcoding/Spare -f mode=index
```

The workflow then runs on cron `17 */3 * * *` in `index` mode. Check the `data` branch has a new `snapshot.json` commit (`chore(data): update snapshot`).

Local dry run (no push): `pnpm -C packages/spare-indexer start rebuild --network mainnet --out /tmp/snapshot.json`.

## 9. Verify the dashboard (Maintainer)

The website reads `snapshot.json` from the `data` branch at build time (production is forced to the remote snapshot). Trigger a deploy (push to `main`, the deploy hook, or Vercel redeploy), then check:

- https://donatespare.xyz/en/foundations/ lists the registered foundation (verified and active only).
- https://donatespare.xyz/en/dashboard/ shows totals; the foundation page shows apps, the unattributed amount apart, and transaction links, and no donor addresses.
- The sample-data banner is gone (it only shows in fixture mode).

If the build fails on a GitHub rate limit, set `GITHUB_TOKEN` (read-only) in the Vercel build environment.

## 10. Demo subdomain (Maintainer)

- Vercel: add the domain `demo.donatespare.xyz` to the website project (alias).
- DNS: create a `CNAME` for `demo` pointing to the target Vercel shows for the domain.
- Vercel environment: set `PUBLIC_SPARE_DEMO_MAINNET=on` for Production and redeploy. Mainnet stays off by default and is only active when the variable is on and a foundation account is configured; the UI labels it "Mainnet: real USDC".
- Check `https://demo.donatespare.xyz/` serves the demo and `https://demo.donatespare.xyz/.well-known/stellar.toml` lists `<FOUNDATION_ACCOUNT>`.

## 11. Update the evidence map (Maintainer, PR to main)

Fill the TODO rows of "Deliverable 2 evidence" in `README.md`: mainnet registry contract id (link to stellar.expert contract page), the verified build link, review issue #15 (and the "unreviewed" label if the fallback applied), dashboard URL, demo subdomain, first indexer run and the registration transaction.

## Failure and rollback notes

| Symptom | Meaning | Action |
|---|---|---|
| Indexer exit **2** (`RPC history gap`) | The last cursor fell outside RPC retention (~7 days). | Run the workflow with `mode=rebuild` (Horizon replay; never RPC). Then the cron resumes. |
| Indexer exit **3** | Config or usage error: empty `registryContracts`, missing `SPARE_RPC_URL`, bad flags. | Fix `indexer.config.json` or the secret; nothing was written. |
| Indexer exit **1** | Runtime error (RPC or Horizon unavailable, snapshot failed the privacy guard). | Re-run; the previous snapshot stays unchanged (writes are atomic). |
| `::warning::` near expiry | A registry entry is close to TTL expiry. | The foundation signs `update` (or `register` if archived) with the same name and website to extend the TTL. |
| Wrong contract deployed | No admin, no upgrade. | Deploy a new one (step 4), point the config at the new id, add the old id only if its history must stay. |
| Bad snapshot on `data` | Dashboard shows wrong data. | Revert the last `data` commit, or run `mode=rebuild`; the website picks it up on the next build. |
| Need to stop publishing | | `gh variable set SPARE_INDEXER_ENABLED --body false --repo thesatieofcoding/Spare`. |
