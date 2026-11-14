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
- `name`: 1..=64 bytes of valid UTF-8 (`InvalidName` otherwise, never a trap). Rejected: control characters (C0, C1, DEL), bidirectional controls (U+202A-202E, U+2066-2069, U+200E/F, U+061C), zero-width characters (U+200B-200D, U+2060, U+FEFF), and leading or trailing whitespace. Valid non-ASCII text such as `Fundación Esperanza` is accepted.
- `website`: 1..=253 bytes, a lowercase ASCII hostname: only `a-z 0-9 . -`, at least two labels separated by `.`, each label 1..=63 bytes and not starting or ending with `-`, and a final label (TLD) of 2..=63 letters `a-z`. This rejects IPv4 literals (`192.168.0.1`), numeric TLDs (`example.123`), punycode TLDs (`xn--...`) and bracketed IPv6 (`[::1]`, also outside the charset); it matches the SDK `stellar.toml` hostname rule. The charset already excludes control and invisible characters, so name hygiene rules are moot for the website. No scheme, path, port, query, userinfo, uppercase or non-ASCII (IDNs go in punycode), so each domain has one stored form. This is a format check only; domain ownership is verified off-chain via `stellar.toml` (SEP-1).

## Errors

| Code | Name | When |
|---|---|---|
| 1 | `AlreadyRegistered` | `register` and an **active** entry exists |
| 2 | `NotFound` | `update` / `deactivate` with no entry |
| 3 | `Inactive` | `update` / `deactivate` on a deactivated entry |
| 4 | `InvalidName` | name empty, > 64 bytes, invalid UTF-8, contains control/bidi/zero-width characters, or has leading/trailing whitespace |
| 5 | `InvalidWebsite` | website empty, > 253 bytes, or not a valid lowercase hostname with an alphabetic TLD (see Validation) |

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
- Deactivated entries are not TTL-extended while inactive; they may be archived (see TTL; the indexer has the history). Reactivating goes through `register`, which restores the entry if needed.

## TTL

Persistent storage, key `DataKey::Foundation(account)`. `register` and `update` extend the TTL on every call:
- `extend_to = env.storage().max_ttl()`, read at call time (the network maximum, `max_entry_ttl - 1`; about 180 days on mainnet today). Nothing is hard-coded, so a future lower network maximum cannot make `register` trap.
- `threshold = extend_to - 30 * 17_280` ledgers (about 150 days on mainnet). The extension only happens when the remaining TTL is below the threshold, so a call within ~30 days of the previous one does not reduce or rewrite the TTL.

Mainnet minimum persistent TTL is 2,073,600 ledgers (~120 days), below the threshold, so a fresh `register` always ends at the maximum.

Archival (Protocol 23 auto-restore): an entry that is not touched for the whole TTL is archived, not deleted. It stays restorable, and a transaction that reads or writes it can restore it through the footprint (transactions simulate this automatically). Reads from RPC `getLedgerEntries` return no live entry until it is restored, which is why the indexer flags entries close to expiry. `get`/`is_active` do not extend; `deactivate` does not extend either, and an archived deactivated entry is restored on the next `register`. Foundations should call `update` at least every ~150 days.

## Develop

```
cargo test -p spare-registry
cargo test -p spare-registry update_re_extends_ttl_after_decay
cargo test -p spare-registry ttl_api
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
