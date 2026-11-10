extern crate std;

use soroban_sdk::{
    symbol_short,
    testutils::{storage::Persistent as _, Address as _, Events as _, MockAuth, MockAuthInvoke},
    vec, Address, Env, IntoVal, String, Symbol, Val, Vec,
};

use crate::{Error, Foundation, Registry, RegistryClient, TTL_EXTEND_TO, TTL_THRESHOLD};

fn setup() -> (Env, RegistryClient<'static>, Address) {
    let env = Env::default();
    let id = env.register(Registry, ());
    let client = RegistryClient::new(&env, &id);
    (env, client, id)
}

fn s(env: &Env, v: &str) -> String {
    String::from_str(env, v)
}

fn foundation(env: &Env, name: &str, website: &str, active: bool) -> Foundation {
    Foundation { name: s(env, name), website: s(env, website), active }
}

fn ttl_of(env: &Env, id: &Address, account: &Address) -> u32 {
    env.as_contract(id, || {
        env.storage().persistent().get_ttl(&crate::DataKey::Foundation(account.clone()))
    })
}

// ---------- happy path ----------

#[test]
fn register_stores_active_entry() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    assert_eq!(c.get(&a), None);
    c.register(&a, &s(&env, "Fundacion Uno"), &s(&env, "uno.org"));
    assert_eq!(c.get(&a), Some(foundation(&env, "Fundacion Uno", "uno.org", true)));
    assert!(c.is_active(&a));
}

#[test]
fn update_changes_name_and_website() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    c.update(&a, &s(&env, "Uno 2"), &s(&env, "uno2.org"));
    assert_eq!(c.get(&a), Some(foundation(&env, "Uno 2", "uno2.org", true)));
}

#[test]
fn entries_are_independent_per_account() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    c.register(&a, &s(&env, "A"), &s(&env, "a.org"));
    c.register(&b, &s(&env, "B"), &s(&env, "b.org"));
    c.deactivate(&a);
    assert!(!c.is_active(&a));
    assert!(c.is_active(&b));
}

#[test]
fn is_active_false_for_unknown() {
    let (env, c, _) = setup();
    assert!(!c.is_active(&Address::generate(&env)));
}

// ---------- duplicates / not found ----------

#[test]
fn duplicate_register_rejected() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    let r = c.try_register(&a, &s(&env, "Otro"), &s(&env, "otro.org"));
    assert_eq!(r, Err(Ok(Error::AlreadyRegistered)));
    assert_eq!(c.get(&a), Some(foundation(&env, "Uno", "uno.org", true)));
}

#[test]
fn register_on_deactivated_reactivates_with_new_values() {
    use soroban_sdk::testutils::Ledger as _;
    let (env, c, id) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    c.deactivate(&a);
    // let TTL decay so we can see it re-extended
    env.ledger().with_mut(|l| l.sequence_number += TTL_EXTEND_TO - TTL_THRESHOLD + 10);
    assert!(ttl_of(&env, &id, &a) < TTL_THRESHOLD);
    c.register(&a, &s(&env, "Nuevo"), &s(&env, "nuevo.org"));
    assert_eq!(env.events().all(), expected(&env, &id, "register", &a, "Nuevo", "nuevo.org"));
    assert_eq!(c.get(&a), Some(foundation(&env, "Nuevo", "nuevo.org", true)));
    assert!(c.is_active(&a));
    assert_eq!(ttl_of(&env, &id, &a), TTL_EXTEND_TO);
}

#[test]
fn reactivation_validates_input() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    c.deactivate(&a);
    assert_eq!(
        c.try_register(&a, &s(&env, ""), &s(&env, "uno.org")),
        Err(Ok(Error::InvalidName))
    );
    assert_eq!(
        c.try_register(&a, &s(&env, "Uno"), &s(&env, "https://uno.org")),
        Err(Ok(Error::InvalidWebsite))
    );
    assert!(!c.is_active(&a));
}

#[test]
fn reactivation_by_another_address_fails() {
    let (env, c, id) = setup();
    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    env.mock_all_auths();
    c.register(&owner, &s(&env, "Uno"), &s(&env, "uno.org"));
    c.deactivate(&owner);
    env.mock_auths(&[]);
    let r = c
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "register",
                args: (owner.clone(), s(&env, "Evil"), s(&env, "evil.org")).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_register(&owner, &s(&env, "Evil"), &s(&env, "evil.org"));
    assert!(r.is_err());
    assert_eq!(c.get(&owner), Some(foundation(&env, "Uno", "uno.org", false)));
}

#[test]
fn deactivate_register_deactivate_cycle() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    c.deactivate(&a);
    c.register(&a, &s(&env, "Dos"), &s(&env, "dos.org"));
    c.update(&a, &s(&env, "Tres"), &s(&env, "tres.org"));
    c.deactivate(&a);
    assert_eq!(c.get(&a), Some(foundation(&env, "Tres", "tres.org", false)));
    c.register(&a, &s(&env, "Cuatro"), &s(&env, "cuatro.org"));
    assert_eq!(c.get(&a), Some(foundation(&env, "Cuatro", "cuatro.org", true)));
}

#[test]
fn register_on_active_after_reactivation_is_rejected() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    c.deactivate(&a);
    c.register(&a, &s(&env, "Dos"), &s(&env, "dos.org"));
    assert_eq!(
        c.try_register(&a, &s(&env, "Tres"), &s(&env, "tres.org")),
        Err(Ok(Error::AlreadyRegistered))
    );
}

#[test]
fn update_missing_is_not_found() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    let r = c.try_update(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    assert_eq!(r, Err(Ok(Error::NotFound)));
}

#[test]
fn deactivate_missing_is_not_found() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    assert_eq!(c.try_deactivate(&a), Err(Ok(Error::NotFound)));
}

// ---------- deactivation semantics ----------

#[test]
fn deactivate_keeps_entry_marked_inactive() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    c.deactivate(&a);
    assert_eq!(c.get(&a), Some(foundation(&env, "Uno", "uno.org", false)));
    assert!(!c.is_active(&a));
}

#[test]
fn update_on_deactivated_is_inactive_error() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    c.deactivate(&a);
    let r = c.try_update(&a, &s(&env, "X"), &s(&env, "x.org"));
    assert_eq!(r, Err(Ok(Error::Inactive)));
    assert_eq!(c.get(&a), Some(foundation(&env, "Uno", "uno.org", false)));
}

#[test]
fn deactivate_twice_is_inactive_error() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    c.deactivate(&a);
    assert_eq!(c.try_deactivate(&a), Err(Ok(Error::Inactive)));
}

// ---------- validation ----------

#[test]
fn name_validation() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    let w = s(&env, "uno.org");
    assert_eq!(c.try_register(&a, &s(&env, ""), &w), Err(Ok(Error::InvalidName)));
    let too_long = "n".repeat(65);
    assert_eq!(c.try_register(&a, &s(&env, &too_long), &w), Err(Ok(Error::InvalidName)));
    let max = "n".repeat(64);
    c.register(&a, &s(&env, &max), &w);
}

#[test]
fn name_length_is_counted_in_bytes() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    // 33 x 'ñ' = 66 bytes > 64
    let name = "ñ".repeat(33);
    let r = c.try_register(&a, &s(&env, &name), &s(&env, "uno.org"));
    assert_eq!(r, Err(Ok(Error::InvalidName)));
}

#[test]
fn website_validation() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    let n = s(&env, "Uno");
    for bad in ["", "https://uno.org", "uno.org/path", "uno.org/", "//uno.org", "uno .org", "uno.org\n"] {
        assert_eq!(
            c.try_register(&a, &n, &s(&env, bad)),
            Err(Ok(Error::InvalidWebsite)),
            "website {bad:?} should be rejected"
        );
    }
    let too_long = "w".repeat(254);
    assert_eq!(c.try_register(&a, &n, &s(&env, &too_long)), Err(Ok(Error::InvalidWebsite)));
    let max = "w".repeat(253);
    c.register(&a, &n, &s(&env, &max));
}

#[test]
fn update_validates_input() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    assert_eq!(c.try_update(&a, &s(&env, ""), &s(&env, "uno.org")), Err(Ok(Error::InvalidName)));
    assert_eq!(
        c.try_update(&a, &s(&env, "Uno"), &s(&env, "https://uno.org")),
        Err(Ok(Error::InvalidWebsite))
    );
    assert_eq!(c.get(&a), Some(foundation(&env, "Uno", "uno.org", true)));
}

// ---------- auth ----------

#[test]
fn register_requires_the_accounts_own_auth() {
    let (env, c, id) = setup();
    let a = Address::generate(&env);
    c.mock_auths(&[MockAuth {
        address: &a,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "register",
            args: (a.clone(), s(&env, "Uno"), s(&env, "uno.org")).into_val(&env),
            sub_invokes: &[],
        },
    }])
    .register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    assert_eq!(
        env.auths(),
        std::vec![(
            a.clone(),
            soroban_sdk::testutils::AuthorizedInvocation {
                function: soroban_sdk::testutils::AuthorizedFunction::Contract((
                    id.clone(),
                    Symbol::new(&env, "register"),
                    (a.clone(), s(&env, "Uno"), s(&env, "uno.org")).into_val(&env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
}

#[test]
fn register_with_another_accounts_auth_fails() {
    let (env, c, id) = setup();
    let victim = Address::generate(&env);
    let attacker = Address::generate(&env);
    let r = c
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "register",
                args: (victim.clone(), s(&env, "Evil"), s(&env, "evil.org")).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_register(&victim, &s(&env, "Evil"), &s(&env, "evil.org"));
    assert!(r.is_err());
    assert_eq!(c.get(&victim), None);
}

#[test]
fn register_without_any_auth_fails() {
    let (env, c, _) = setup();
    let a = Address::generate(&env);
    assert!(c.try_register(&a, &s(&env, "Uno"), &s(&env, "uno.org")).is_err());
    assert_eq!(c.get(&a), None);
}

#[test]
fn update_with_another_accounts_auth_fails() {
    let (env, c, id) = setup();
    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    env.mock_all_auths();
    c.register(&owner, &s(&env, "Uno"), &s(&env, "uno.org"));
    env.mock_auths(&[]); // clear blanket auth
    let r = c
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "update",
                args: (owner.clone(), s(&env, "Evil"), s(&env, "evil.org")).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_update(&owner, &s(&env, "Evil"), &s(&env, "evil.org"));
    assert!(r.is_err());
    assert_eq!(c.get(&owner), Some(foundation(&env, "Uno", "uno.org", true)));
}

#[test]
fn deactivate_with_another_accounts_auth_fails() {
    let (env, c, id) = setup();
    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    env.mock_all_auths();
    c.register(&owner, &s(&env, "Uno"), &s(&env, "uno.org"));
    env.mock_auths(&[]);
    let r = c
        .mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "deactivate",
                args: (owner.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_deactivate(&owner);
    assert!(r.is_err());
    assert!(c.is_active(&owner));
}

#[test]
fn owner_auth_allows_update_and_deactivate() {
    let (env, c, id) = setup();
    let a = Address::generate(&env);
    env.mock_all_auths();
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    env.mock_auths(&[]);
    c.mock_auths(&[MockAuth {
        address: &a,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "update",
            args: (a.clone(), s(&env, "Uno 2"), s(&env, "uno2.org")).into_val(&env),
            sub_invokes: &[],
        },
    }])
    .update(&a, &s(&env, "Uno 2"), &s(&env, "uno2.org"));
    c.mock_auths(&[MockAuth {
        address: &a,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "deactivate",
            args: (a.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }])
    .deactivate(&a);
    assert_eq!(c.get(&a), Some(foundation(&env, "Uno 2", "uno2.org", false)));
}

// ---------- TTL ----------

#[test]
fn register_extends_ttl() {
    let (env, c, id) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    assert_eq!(ttl_of(&env, &id, &a), TTL_EXTEND_TO);
}

#[test]
fn update_re_extends_ttl_after_decay() {
    use soroban_sdk::testutils::Ledger as _;
    let (env, c, id) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    // advance until remaining TTL is below the threshold
    let advance = TTL_EXTEND_TO - TTL_THRESHOLD + 10;
    env.ledger().with_mut(|l| l.sequence_number += advance);
    assert!(ttl_of(&env, &id, &a) < TTL_THRESHOLD);
    c.update(&a, &s(&env, "Uno 2"), &s(&env, "uno2.org"));
    assert_eq!(ttl_of(&env, &id, &a), TTL_EXTEND_TO);
}

// ---------- events ----------

fn expected(
    env: &Env,
    id: &Address,
    kind: &str,
    account: &Address,
    name: &str,
    website: &str,
) -> Vec<(Address, Vec<Val>, Val)> {
    vec![
        env,
        (
            id.clone(),
            (symbol_short!("spare"), Symbol::new(env, kind), account.clone()).into_val(env),
            (s(env, name), s(env, website)).into_val(env),
        ),
    ]
}

#[test]
fn register_emits_event() {
    let (env, c, id) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    assert_eq!(env.events().all(), expected(&env, &id, "register", &a, "Uno", "uno.org"));
}

#[test]
fn update_emits_event_with_new_values() {
    let (env, c, id) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    c.update(&a, &s(&env, "Dos"), &s(&env, "dos.org"));
    assert_eq!(env.events().all(), expected(&env, &id, "update", &a, "Dos", "dos.org"));
}

#[test]
fn deactivate_emits_event_with_last_values() {
    let (env, c, id) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    c.deactivate(&a);
    assert_eq!(env.events().all(), expected(&env, &id, "deactivate", &a, "Uno", "uno.org"));
}

#[test]
fn failed_calls_emit_no_events() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    let _ = c.try_register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    assert_eq!(env.events().all().events().len(), 0);
}
