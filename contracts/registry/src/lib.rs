//! Spare foundation registry.
//!
//! One entry per foundation account, writable only by that account.
//! No admin, no upgrade function, no token handling, no funds.
//! See README.md for semantics.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, String,
};

/// Max name length, in UTF-8 bytes.
pub const MAX_NAME_BYTES: u32 = 64;
/// Max website length, in bytes (DNS name limit).
pub const MAX_WEBSITE_BYTES: u32 = 253;

/// Ledgers per day at ~5s per ledger.
const DAY_IN_LEDGERS: u32 = 17_280;
/// If the entry's remaining TTL is below this, `register`/`update` bump it.
pub const TTL_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
/// TTL (in ledgers) the entry is extended to: ~60 days.
pub const TTL_EXTEND_TO: u32 = 60 * DAY_IN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyRegistered = 1,
    NotFound = 2,
    Inactive = 3,
    InvalidName = 4,
    InvalidWebsite = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Foundation(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Foundation {
    pub name: String,
    pub website: String,
    pub active: bool,
}

// Topics: ("spare", "<kind>", account). Data: [name, website].
#[contractevent(topics = ["spare", "register"], data_format = "vec")]
pub struct Registered {
    #[topic]
    pub account: Address,
    pub name: String,
    pub website: String,
}

#[contractevent(topics = ["spare", "update"], data_format = "vec")]
pub struct Updated {
    #[topic]
    pub account: Address,
    pub name: String,
    pub website: String,
}

#[contractevent(topics = ["spare", "deactivate"], data_format = "vec")]
pub struct Deactivated {
    #[topic]
    pub account: Address,
    pub name: String,
    pub website: String,
}

fn validate_name(name: &String) -> Result<(), Error> {
    let len = name.len();
    if len == 0 || len > MAX_NAME_BYTES {
        return Err(Error::InvalidName);
    }
    Ok(())
}

/// Max DNS label length, in bytes.
const MAX_LABEL_BYTES: usize = 63;

/// Lowercase ASCII hostname: 1..=253 bytes, only `a-z 0-9 . -`, at least two
/// labels separated by `.`, each label 1..=63 bytes and not starting or ending
/// with `-`. Rejects schemes, paths, ports, queries, userinfo, uppercase and
/// non-ASCII, so each domain has exactly one stored form.
fn validate_website(website: &String) -> Result<(), Error> {
    let len = website.len();
    if len == 0 || len > MAX_WEBSITE_BYTES {
        return Err(Error::InvalidWebsite);
    }
    let mut buf = [0u8; MAX_WEBSITE_BYTES as usize];
    let buf = &mut buf[..len as usize];
    website.copy_into_slice(buf);
    let allowed = |b: &u8| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'.' || *b == b'-';
    if !buf.iter().all(allowed) || !buf.contains(&b'.') {
        return Err(Error::InvalidWebsite);
    }
    for label in buf.split(|b| *b == b'.') {
        let bad = label.is_empty()
            || label.len() > MAX_LABEL_BYTES
            || label[0] == b'-'
            || label[label.len() - 1] == b'-';
        if bad {
            return Err(Error::InvalidWebsite);
        }
    }
    Ok(())
}

fn load(env: &Env, account: &Address) -> Option<Foundation> {
    env.storage().persistent().get(&DataKey::Foundation(account.clone()))
}

fn save(env: &Env, account: &Address, f: &Foundation) {
    let key = DataKey::Foundation(account.clone());
    env.storage().persistent().set(&key, f);
}

fn extend(env: &Env, account: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::Foundation(account.clone()),
        TTL_THRESHOLD,
        TTL_EXTEND_TO,
    );
}

#[contract]
pub struct Registry;

#[contractimpl]
impl Registry {
    /// Create the entry for `account`, or reactivate a deactivated one
    /// (overwriting name/website). Fails with `AlreadyRegistered` if the
    /// entry is active.
    pub fn register(env: Env, account: Address, name: String, website: String) -> Result<(), Error> {
        account.require_auth();
        validate_name(&name)?;
        validate_website(&website)?;
        // An active entry blocks registration; a deactivated one is reactivated.
        if load(&env, &account).is_some_and(|f| f.active) {
            return Err(Error::AlreadyRegistered);
        }
        save(&env, &account, &Foundation { name: name.clone(), website: website.clone(), active: true });
        extend(&env, &account);
        Registered { account, name, website }.publish(&env);
        Ok(())
    }

    /// Replace name and website of an active entry.
    pub fn update(env: Env, account: Address, name: String, website: String) -> Result<(), Error> {
        account.require_auth();
        validate_name(&name)?;
        validate_website(&website)?;
        let f = load(&env, &account).ok_or(Error::NotFound)?;
        if !f.active {
            return Err(Error::Inactive);
        }
        save(&env, &account, &Foundation { name: name.clone(), website: website.clone(), active: true });
        extend(&env, &account);
        Updated { account, name, website }.publish(&env);
        Ok(())
    }

    /// Mark an active entry inactive. The entry is kept (history for the
    /// indexer). `register` reactivates it.
    pub fn deactivate(env: Env, account: Address) -> Result<(), Error> {
        account.require_auth();
        let mut f = load(&env, &account).ok_or(Error::NotFound)?;
        if !f.active {
            return Err(Error::Inactive);
        }
        f.active = false;
        save(&env, &account, &f);
        Deactivated { account, name: f.name, website: f.website }.publish(&env);
        Ok(())
    }

    pub fn get(env: Env, account: Address) -> Option<Foundation> {
        load(&env, &account)
    }

    pub fn is_active(env: Env, account: Address) -> bool {
        load(&env, &account).map(|f| f.active).unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
