extern crate std;

use soroban_sdk::{
    symbol_short,
    testutils::{storage::Persistent as _, Address as _, Events as _, MockAuth, MockAuthInvoke},
    vec, Address, Env, IntoVal, String, Symbol, Val, Vec,
};

use crate::{Error, Foundation, Registry, RegistryClient};

// Explicit network parameters (mainnet, verified 2026-11-14); never rely on testutils defaults.
const MIN_PERSISTENT_TTL: u32 = 2_073_600;
const MAX_ENTRY_TTL: u32 = 3_110_400;
const MIN_TEMP_TTL: u32 = 17_280;
/// `Storage::max_ttl()` = max_entry_ttl - 1 under the explicit LedgerInfo.
const EXTEND_TO: u32 = MAX_ENTRY_TTL - 1;
const THRESHOLD: u32 = EXTEND_TO - 30 * 17_280;

fn setup() -> (Env, RegistryClient<'static>, Address) {
    use soroban_sdk::testutils::Ledger as _;
    let env = Env::default();
    env.ledger().with_mut(|l| {
        l.sequence_number = 1_000;
        l.min_persistent_entry_ttl = MIN_PERSISTENT_TTL;
        l.max_entry_ttl = MAX_ENTRY_TTL;
        l.min_temp_entry_ttl = MIN_TEMP_TTL;
    });
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
    env.ledger().with_mut(|l| l.sequence_number += EXTEND_TO - THRESHOLD + 10);
    assert!(ttl_of(&env, &id, &a) < THRESHOLD);
    c.register(&a, &s(&env, "Nuevo"), &s(&env, "nuevo.org"));
    assert_eq!(env.events().all(), expected(&env, &id, "register", &a, "Nuevo", "nuevo.org"));
    assert_eq!(c.get(&a), Some(foundation(&env, "Nuevo", "nuevo.org", true)));
    assert!(c.is_active(&a));
    assert_eq!(ttl_of(&env, &id, &a), EXTEND_TO);
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
    let max = std::format!("{}.{}.{}.{}", "a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(61));
    assert_eq!(max.len(), 253);
    c.register(&a, &n, &s(&env, &max));
}

#[test]
fn website_must_be_lowercase_hostname() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let n = s(&env, "Uno");
    for bad in [
        "Uno.org", "UNO.ORG", "uno.org:8080", "uno.org?x=1", "user@uno.org", "uno.org#a",
        "uno_org.org", "uno", ".uno.org", "uno.org.", "-uno.org", "uno.org-", "uno..org",
        "uno.org\\", "unó.org", "a.-b.org", "a-.b.org", "uno.-org",
    ] {
        let a = Address::generate(&env);
        assert_eq!(
            c.try_register(&a, &n, &s(&env, bad)),
            Err(Ok(Error::InvalidWebsite)),
            "website {bad:?} should be rejected"
        );
    }
    let long_label = std::format!("{}.org", "a".repeat(64));
    let max_label = std::format!("{}.org", "a".repeat(63));
    let a = Address::generate(&env);
    assert_eq!(c.try_register(&a, &n, &s(&env, &long_label)), Err(Ok(Error::InvalidWebsite)));
    c.register(&a, &n, &s(&env, &max_label));
    for good in ["uno.org", "demo.donatespare.xyz", "my-ngo.co.ke", "123.example", "foundation.org"] {
        let a = Address::generate(&env);
        c.register(&a, &n, &s(&env, good));
        assert!(c.is_active(&a), "website {good:?} should be accepted");
    }
}

#[test]
fn website_rejects_ip_literals_and_numeric_tld() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let n = s(&env, "Uno");
    for bad in [
        "192.168.0.1", "1.2.3.4", "10.0.0.1", "example.123", "uno.org1", "uno.o", "uno.xn--p1ai",
        "[::1]", "::1", "uno.a1", "uno.1a",
    ] {
        let a = Address::generate(&env);
        assert_eq!(
            c.try_register(&a, &n, &s(&env, bad)),
            Err(Ok(Error::InvalidWebsite)),
            "website {bad:?} should be rejected"
        );
    }
    let a = Address::generate(&env);
    c.register(&a, &n, &s(&env, "uno.org"));
    for bad in ["192.168.0.1", "example.123"] {
        assert_eq!(
            c.try_update(&a, &n, &s(&env, bad)),
            Err(Ok(Error::InvalidWebsite)),
            "update to {bad:?} should be rejected"
        );
    }
    let tld63 = std::format!("uno.{}", "a".repeat(63));
    let tld64 = std::format!("uno.{}", "a".repeat(64));
    c.update(&a, &n, &s(&env, &tld63));
    assert_eq!(c.try_update(&a, &n, &s(&env, &tld64)), Err(Ok(Error::InvalidWebsite)));
    c.update(&a, &n, &s(&env, "foundation.org"));
}

const BAD_NAME_CHARS: [&str; 20] = [
    "\u{202A}", "\u{202E}", "\u{2066}", "\u{2069}", "\u{200E}", "\u{200F}", "\u{061C}",
    "\u{200B}", "\u{200C}", "\u{200D}", "\u{2060}", "\u{FEFF}", "\n", "\t", "\0", "\u{1F}",
    "\u{7F}", "\u{80}", "\u{9F}", "\r",
];

#[test]
fn name_rejects_control_bidi_and_zero_width() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let w = s(&env, "uno.org");
    for ch in BAD_NAME_CHARS {
        let a = Address::generate(&env);
        let name = std::format!("Fund{ch}acion");
        assert_eq!(
            c.try_register(&a, &s(&env, &name), &w),
            Err(Ok(Error::InvalidName)),
            "name containing {ch:?} should be rejected"
        );
        let name = std::format!("{ch}Fundacion");
        assert_eq!(c.try_register(&a, &s(&env, &name), &w), Err(Ok(Error::InvalidName)));
    }
}

#[test]
fn name_rejects_invalid_utf8_without_trapping() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    let w = s(&env, "uno.org");
    for bytes in [&[0xFFu8, 0xFE][..], &[b'a', 0xC3][..], &[0xC0, 0x80][..], &[0xED, 0xA0, 0x80][..]] {
        let name = String::from_bytes(&env, bytes);
        assert_eq!(c.try_register(&a, &name, &w), Err(Ok(Error::InvalidName)));
    }
}

#[test]
fn name_accepts_valid_non_ascii_and_inner_spaces() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let w = s(&env, "uno.org");
    for good in ["Fundación Esperanza", "Ñandú", "日本語 財団", "Fondation d'Été"] {
        let a = Address::generate(&env);
        c.register(&a, &s(&env, good), &w);
        assert_eq!(c.get(&a), Some(foundation(&env, good, "uno.org", true)));
    }
}

#[test]
fn name_rejects_leading_and_trailing_spaces() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let w = s(&env, "uno.org");
    for bad in [" Uno", "Uno ", " ", "  Uno  "] {
        let a = Address::generate(&env);
        assert_eq!(c.try_register(&a, &s(&env, bad), &w), Err(Ok(Error::InvalidName)), "{bad:?}");
    }
}

#[test]
fn website_rejects_control_and_invisible_characters() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let n = s(&env, "Uno");
    for ch in BAD_NAME_CHARS {
        let a = Address::generate(&env);
        let site = std::format!("uno{ch}.org");
        assert_eq!(
            c.try_register(&a, &n, &s(&env, &site)),
            Err(Ok(Error::InvalidWebsite)),
            "website containing {ch:?} should be rejected"
        );
    }
    let a = Address::generate(&env);
    let bad = String::from_bytes(&env, &[b'u', 0xFF, b'.', b'o', b'r', b'g']);
    assert_eq!(c.try_register(&a, &n, &bad), Err(Ok(Error::InvalidWebsite)));
}

#[test]
fn text_hygiene_applies_on_update() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    for ch in BAD_NAME_CHARS {
        let name = std::format!("U{ch}no");
        assert_eq!(
            c.try_update(&a, &s(&env, &name), &s(&env, "uno.org")),
            Err(Ok(Error::InvalidName)),
            "{ch:?}"
        );
        let site = std::format!("uno{ch}.org");
        assert_eq!(
            c.try_update(&a, &s(&env, "Uno"), &s(&env, &site)),
            Err(Ok(Error::InvalidWebsite)),
            "{ch:?}"
        );
    }
    assert_eq!(
        c.try_update(&a, &String::from_bytes(&env, &[0xFF]), &s(&env, "uno.org")),
        Err(Ok(Error::InvalidName))
    );
    c.update(&a, &s(&env, "Fundación Esperanza"), &s(&env, "uno.org"));
    assert_eq!(c.get(&a), Some(foundation(&env, "Fundación Esperanza", "uno.org", true)));
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
fn ttl_api_max_ttl_follows_ledger_info() {
    use soroban_sdk::testutils::Ledger as _;
    let (env, _, id) = setup();
    let max_ttl = |env: &Env| env.as_contract(&id, || env.storage().max_ttl());
    assert_eq!(max_ttl(&env), EXTEND_TO);
    env.ledger().with_mut(|l| l.max_entry_ttl = 1_000_000);
    assert_eq!(max_ttl(&env), 1_000_000 - 1);
}

#[test]
fn register_extends_ttl_to_max_and_above_network_min() {
    let (env, c, id) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    let ttl = ttl_of(&env, &id, &a);
    assert_eq!(ttl, EXTEND_TO);
    assert!(ttl >= MIN_PERSISTENT_TTL);
}

#[test]
fn update_re_extends_ttl_after_decay() {
    use soroban_sdk::testutils::Ledger as _;
    let (env, c, id) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    // advance until remaining TTL is below the threshold
    env.ledger().with_mut(|l| l.sequence_number += EXTEND_TO - THRESHOLD + 10);
    assert!(ttl_of(&env, &id, &a) < THRESHOLD);
    c.update(&a, &s(&env, "Uno 2"), &s(&env, "uno2.org"));
    assert_eq!(ttl_of(&env, &id, &a), EXTEND_TO);
}

#[test]
fn update_above_threshold_does_not_reduce_ttl() {
    use soroban_sdk::testutils::Ledger as _;
    let (env, c, id) = setup();
    env.mock_all_auths();
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    env.ledger().with_mut(|l| l.sequence_number += 10);
    let before = ttl_of(&env, &id, &a);
    assert!(before > THRESHOLD);
    c.update(&a, &s(&env, "Uno 2"), &s(&env, "uno2.org"));
    assert_eq!(ttl_of(&env, &id, &a), before);
}

#[test]
fn register_does_not_trap_when_network_max_ttl_shrinks() {
    use soroban_sdk::testutils::Ledger as _;
    let (env, c, id) = setup();
    env.mock_all_auths();
    env.ledger().with_mut(|l| {
        l.max_entry_ttl = 2_700_000;
        l.min_persistent_entry_ttl = 2_073_600;
    });
    let a = Address::generate(&env);
    c.register(&a, &s(&env, "Uno"), &s(&env, "uno.org"));
    let ttl = ttl_of(&env, &id, &a);
    assert_eq!(ttl, 2_700_000 - 1);
    assert!(ttl >= MIN_PERSISTENT_TTL);
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

/// Shared with spare-sdk (packages/spare-sdk/test/hostname-parity.test.ts).
const HOSTNAME_VECTORS: &str = include_str!("../../../fixtures/hostname-vectors.txt");

#[test]
fn website_matches_shared_hostname_vectors() {
    let (env, c, _) = setup();
    env.mock_all_auths();
    let n = s(&env, "Uno");
    let mut seen = 0;
    for line in HOSTNAME_VECTORS.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
        let (verdict, host) = line.split_once('|').expect("vector line is verdict|host");
        let a = Address::generate(&env);
        let res = c.try_register(&a, &n, &s(&env, host));
        match verdict {
            "accept" => assert_eq!(res, Ok(Ok(())), "contract should accept {host:?}"),
            "reject" => assert_eq!(res, Err(Ok(Error::InvalidWebsite)), "contract should reject {host:?}"),
            other => panic!("unknown verdict {other:?}"),
        }
        seen += 1;
    }
    assert!(seen >= 20, "vector file looks truncated: {seen}");
}
