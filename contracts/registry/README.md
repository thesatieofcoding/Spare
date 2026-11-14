# spare-registry

Soroban contract: one registry entry per foundation account. No admin, no upgrade function, no token handling, no funds. Only the foundation's own account can write its entry (`account.require_auth()`).

Built against `soroban-sdk =25.3.0` (newer releases require rustc 1.91).

## Functions

| Function | Auth | Result |
|---|---|---|
| `register(account, name, website)` | `account` | creates an active entry, or reactivates a deactivated one (overwrites name + website) |
| `update(account, name, website)` | `account` | replaces name + website of an **active** entry |
| `deactivate(account)` | `account` | marks the entry inactive (kept in storage) |
| `get(account) -> Option<Foundation>` | none | `Foundation { name, website, active }` |
| `is_active(account) -> bool` | none | `false` if missing or inactive |

Validation (checked after auth, before storage):
- `name`: 1..=64 UTF-8 bytes.
- `website`: 1..=253 bytes, a lowercase ASCII hostname: only `a-z 0-9 . -`, at least two labels separated by `.`, each label 1..=63 bytes and not starting or ending with `-`. No scheme, path, port, query, userinfo, uppercase or non-ASCII (IDNs go in punycode), so each domain has one stored form. This is a format check only; domain ownership is verified off-chain via `stellar.toml` (SEP-1).

## Errors

| Code | Name | When |
|---|---|---|
| 1 | `AlreadyRegistered` | `register` and an **active** entry exists |
| 2 | `NotFound` | `update` / `deactivate` with no entry |
| 3 | `Inactive` | `update` / `deactivate` on a deactivated entry |
| 4 | `InvalidName` | name empty or > 64 bytes |
| 5 | `InvalidWebsite` | website empty, > 253 bytes, or not a lowercase hostname (see Validation) |

## Events

Topics `["spare", <kind>, account]`; data is a vec `[name, website]` (as `#[contractevent]`, `data_format = "vec"`).

| kind | emitted by | data |
|---|---|---|
| `register` | `register` | new name, website |
| `update` | `update` | new name, website |
| `deactivate` | `deactivate` | last name, website |

Failed calls emit nothing.

## Deactivation semantics

- `deactivate` keeps the entry with `active = false`; it is never deleted, so the indexer keeps history.
- Deactivation is **reversible**: `register` on a deactivated account reactivates it (`active = true`, name and website overwritten after the usual validation, TTL extended, normal `register` event). It needs the account's own auth.
- `register` on an active entry is `AlreadyRegistered`; `update` / `deactivate` on a deactivated entry are `Inactive`.
- Indexer state machine per account: `register -> (update | deactivate -> register)*`. A `register` event for an already-known account means reactivation.
- Deactivated entries are not TTL-extended while inactive; they may expire from ledger state (the indexer has the history). Reactivating an expired entry is a fresh `register`.

## TTL

Persistent storage, key `DataKey::Foundation(account)`. `register` and `update` call `extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO)`:
- `TTL_THRESHOLD = 30 * 17_280` ledgers (~30 days)
- `TTL_EXTEND_TO = 60 * 17_280` ledgers (~60 days)

Entries not touched for ~60 days expire; the indexer flags entries close to expiry so the foundation can call `update` to renew. `get`/`is_active` do not extend.

## Develop

```
cargo test -p spare-registry
cargo test -p spare-registry update_re_extends_ttl_after_decay
```

Release build (needs the wasm32 target; not used for tests): `stellar contract build`.

## Verified release (SEP-55)

Bump `version` in `Cargo.toml` to `X.Y.Z`, then push a tag `registry-vX.Y.Z` (the WASM file is named from the crate version, not the tag). `.github/workflows/registry-release.yml` runs the tests, then stellar-expert's `soroban-build-workflow` (pinned by commit SHA) builds the optimized WASM from that commit with `source_repo=github:thesatieofcoding/Spare` and `home_domain=donatespare.xyz` metadata, publishes a GitHub release with the WASM, attests it, and registers the build with stellar.expert contract validation.

Deploy to mainnet only the WASM attached to that release; a local build has a different hash. Check before deploying:

```
stellar contract info meta --wasm spare-registry_vX.Y.Z.wasm   # source_repo, home_domain
gh attestation verify spare-registry_vX.Y.Z.wasm --repo thesatieofcoding/Spare
```

The repository must be public for anyone to verify the attestation.
