//! Unit tests: protocol vectors against an independent ed25519 implementation,
//! and the session state machine with the gate's own storage.
//! Cross-contract behavior against the real Sputnik wasm lives in tests/sandbox.rs.

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{test_vm_config, testing_env, PromiseResult, RuntimeFeesConfig};
use sha2::{Digest, Sha256};

const VECTORS: &str = include_str!("../tests/vectors.json");
const GATE: &str = "ceremony-gate-v1.accoryn.testnet";
const DAO: &str = "team.sputnikv2.testnet";
const PAYEE: &str = "payee.testnet";
const SEC: u64 = 1_000_000_000;
const T0: u64 = 1_800_000_000 * SEC;

fn account(id: &str) -> AccountId {
    id.parse().unwrap()
}
fn members() -> Vec<AccountId> {
    vec![account("alice.testnet"), account("bob.testnet"), account("carol.testnet")]
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn unhex(text: &str) -> Vec<u8> {
    (0..text.len()).step_by(2).map(|i| u8::from_str_radix(&text[i..i + 2], 16).unwrap()).collect()
}

/// Independent reimplementation of the TS seed derivation.
fn seed(gate: &str, dao: &str, proposal_id: u64, challenge: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    for (index, part) in [b"accoryn-ceremony-seed-v1".as_slice(), gate.as_bytes(), dao.as_bytes(), proposal_id.to_string().as_bytes(), challenge]
        .iter()
        .enumerate()
    {
        if index > 0 {
            hasher.update([0u8]);
        }
        hasher.update(part);
    }
    hasher.finalize().into()
}

fn context(predecessor: &str, at: u64, deposit: NearToken, gas_tgas: u64) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account(GATE))
        .predecessor_account_id(account(predecessor))
        .signer_account_id(account(predecessor))
        .block_timestamp(at)
        .attached_deposit(deposit)
        .prepaid_gas(Gas::from_tgas(gas_tgas));
    builder
}

fn set(predecessor: &str, at: u64) {
    testing_env!(context(predecessor, at, ZERO, 300).build());
}

fn gate() -> CeremonyGate {
    set("deployer.testnet", T0);
    CeremonyGate::new("sputnikv2.testnet".into(), 1, 600, U128(100_000_000_000_000_000_000_000))
}

fn session_key(challenge: &[u8], proposal_id: u64) -> SigningKey {
    SigningKey::from_bytes(&seed(GATE, DAO, proposal_id, challenge))
}

fn transfer_kind(amount: u128) -> Value {
    json!({"Transfer": {"token_id": "", "receiver_id": PAYEE, "amount": amount.to_string(), "msg": null}})
}

/// Inserts an open session as the open_session callback would.
fn open(contract: &mut CeremonyGate, proposal_id: u64, amount: u128, key: &SigningKey) -> u64 {
    let session_pk = PublicKey::from_parts(CurveType::ED25519, key.verifying_key().to_bytes().to_vec()).unwrap();
    let session_id = contract.next_session_id;
    contract.next_session_id += 1;
    contract.sessions.insert(
        (account(DAO), proposal_id),
        Session {
            session_id,
            host: account("alice.testnet"),
            session_pk,
            receiver_id: account(PAYEE),
            amount,
            kind_json: transfer_kind(amount).to_string(),
            eligible: members(),
            attestations: vec![],
            opened_at: T0,
            expires_at: T0 + 300 * SEC,
            status: Status::Open,
            last_error: None,
            evidence_txs: vec![],
        },
    );
    session_id
}

fn signature(key: &SigningKey, proposal_id: u64, session_id: u64, amount: u128, attendee: &str) -> Base64VecU8 {
    let message = protocol::attestation_message(GATE, DAO, proposal_id, session_id, PAYEE, amount, attendee);
    Base64VecU8(key.sign(&message).to_bytes().to_vec())
}

fn attest_as(contract: &mut CeremonyGate, who: &str, key: &SigningKey, proposal_id: u64, session_id: u64, amount: u128) -> u32 {
    set(who, T0 + 10 * SEC);
    contract.attest(account(DAO), proposal_id, signature(key, proposal_id, session_id, amount, who))
}

fn expect_panic<F: FnOnce() + std::panic::UnwindSafe>(expected: &str, f: F) {
    let error = std::panic::catch_unwind(f).expect_err("expected a panic");
    let message = error
        .downcast_ref::<String>()
        .cloned()
        .or_else(|| error.downcast_ref::<&str>().map(|s| s.to_string()))
        .unwrap_or_default();
    assert!(message.contains(expected), "expected {expected}, got {message}");
}

// ------------------------------------------------------------------ vectors

#[test]
fn shared_vectors_match_an_independent_ed25519_implementation() {
    let file: Value = serde_json::from_str(VECTORS).unwrap();
    assert_eq!(file["version"], "accoryn-ceremony-v1");
    let vectors = file["vectors"].as_array().unwrap();
    assert!(vectors.len() >= 2);
    for v in vectors {
        let text = |field: &str| v[field].as_str().unwrap().to_string();
        let proposal_id: u64 = text("proposalId").parse().unwrap();
        let session_id: u64 = text("sessionId").parse().unwrap();
        let amount: u128 = text("amountAtomic").parse().unwrap();
        let challenge = unhex(&text("challengeHex"));
        let seed = seed(&text("gateId"), &text("daoId"), proposal_id, &challenge);
        assert_eq!(hex(&seed), text("seedHex"), "{}", text("name"));
        let key = SigningKey::from_bytes(&seed);
        assert_eq!(hex(key.verifying_key().as_bytes()), text("sessionPublicKeyHex"));
        let pk: PublicKey = text("sessionPublicKey").parse().unwrap();
        assert_eq!(&pk.as_bytes()[1..], key.verifying_key().as_bytes());
        let message = protocol::attestation_message(
            &text("gateId"), &text("daoId"), proposal_id, session_id, &text("receiverId"), amount, &text("attendeeId"),
        );
        assert_eq!(hex(&message), text("messageHex"));
        let signature = key.sign(&message).to_bytes();
        assert_eq!(hex(&signature), text("signatureHex"));
        set("anyone.testnet", T0);
        assert!(env::ed25519_verify(&signature, &message, key.verifying_key().as_bytes()));
    }
}

// ----------------------------------------------------------------- sessions

#[test]
fn attendees_attest_with_their_own_accounts_and_enough_attendees_trigger_the_vote() {
    let mut contract = gate();
    let key = session_key(b"fifteen-bytes!!", 7);
    let amount = tiers::ONE_NEAR / 2;
    let sid = open(&mut contract, 7, amount, &key);
    assert_eq!(attest_as(&mut contract, "alice.testnet", &key, 7, sid, amount), 1);
    // One attendee is not enough for the 2-attendee tier.
    set("alice.testnet", T0 + 20 * SEC);
    expect_panic("ERR_NOT_ENOUGH_ATTENDEES", std::panic::AssertUnwindSafe(|| {
        let _ = contract.execute(account(DAO), 7);
    }));
    assert_eq!(attest_as(&mut contract, "bob.testnet", &key, 7, sid, amount), 2);
    set("carol.testnet", T0 + 30 * SEC);
    let _ = contract.execute(account(DAO), 7);
    let view = contract.get_session(account(DAO), 7).unwrap();
    assert_eq!(view.status, "Executing");
    assert_eq!(contract.get_tiers(account(DAO)).window_spent.0, amount);
}

#[test]
fn attestations_are_bound_to_attendee_session_payment_and_key() {
    let mut contract = gate();
    let key = session_key(b"fifteen-bytes!!", 7);
    let other_key = session_key(b"other-challenge", 7);
    let amount = 3;
    let sid = open(&mut contract, 7, amount, &key);
    let attempts = [
        ("alice.testnet", signature(&key, 7, sid, amount, "bob.testnet")), // bob's attestation replayed by alice
        ("alice.testnet", signature(&other_key, 7, sid, amount, "alice.testnet")), // stale or wrong challenge
        ("alice.testnet", signature(&key, 7, sid + 1, amount, "alice.testnet")), // other session
        ("alice.testnet", signature(&key, 7, sid, amount + 1, "alice.testnet")), // changed amount
        ("alice.testnet", signature(&key, 8, sid, amount, "alice.testnet")), // other proposal
        ("alice.testnet", Base64VecU8(vec![0u8; 63])),
    ];
    for (who, sig) in attempts {
        set(who, T0 + 10 * SEC);
        expect_panic("ERR_BAD_SIGNATURE", std::panic::AssertUnwindSafe(|| {
            contract.attest(account(DAO), 7, sig);
        }));
    }
    set("mallory.testnet", T0 + 10 * SEC);
    expect_panic("ERR_NOT_ELIGIBLE", std::panic::AssertUnwindSafe(|| {
        contract.attest(account(DAO), 7, signature(&key, 7, sid, amount, "mallory.testnet"));
    }));
    attest_as(&mut contract, "alice.testnet", &key, 7, sid, amount);
    expect_panic("ERR_ALREADY_ATTESTED", std::panic::AssertUnwindSafe(|| {
        attest_as(&mut contract, "alice.testnet", &key, 7, sid, amount);
    }));
}

#[test]
fn expired_sessions_reject_attestation_and_execution() {
    let mut contract = gate();
    let key = session_key(b"fifteen-bytes!!", 1);
    let sid = open(&mut contract, 1, 5, &key);
    attest_as(&mut contract, "alice.testnet", &key, 1, sid, 5);
    attest_as(&mut contract, "bob.testnet", &key, 1, sid, 5);
    set("carol.testnet", T0 + 301 * SEC);
    expect_panic("ERR_SESSION_EXPIRED", std::panic::AssertUnwindSafe(|| {
        contract.attest(account(DAO), 1, signature(&key, 1, sid, 5, "carol.testnet"));
    }));
    expect_panic("ERR_SESSION_EXPIRED", std::panic::AssertUnwindSafe(|| {
        let _ = contract.execute(account(DAO), 1);
    }));
    assert_eq!(contract.get_session(account(DAO), 1).unwrap().status, "Expired");
}

#[test]
fn split_payments_accumulate_within_the_spend_window() {
    let mut contract = gate();
    // First payment of exactly 1 NEAR needs 2 attendees and is voted.
    let key = session_key(b"fifteen-bytes!!", 1);
    let sid = open(&mut contract, 1, tiers::ONE_NEAR, &key);
    attest_as(&mut contract, "alice.testnet", &key, 1, sid, tiers::ONE_NEAR);
    attest_as(&mut contract, "bob.testnet", &key, 1, sid, tiers::ONE_NEAR);
    set("alice.testnet", T0 + 20 * SEC);
    let _ = contract.execute(account(DAO), 1);
    accept_vote(&mut contract, 1, sid, tiers::ONE_NEAR, true);
    // A second small payment in the same window now falls in the 3-attendee tier.
    let key2 = session_key(b"second-session!", 2);
    let sid2 = open(&mut contract, 2, 1, &key2);
    attest_as(&mut contract, "alice.testnet", &key2, 2, sid2, 1);
    attest_as(&mut contract, "bob.testnet", &key2, 2, sid2, 1);
    assert_eq!(contract.get_session(account(DAO), 2).unwrap().required, 3);
    set("alice.testnet", T0 + 40 * SEC);
    expect_panic("ERR_NOT_ENOUGH_ATTENDEES", std::panic::AssertUnwindSafe(|| {
        let _ = contract.execute(account(DAO), 2);
    }));
}

fn accept_vote(contract: &mut CeremonyGate, proposal_id: u64, session_id: u64, amount: u128, success: bool) -> bool {
    let window_id = contract.tier_config(&account(DAO)).window_id(T0 + 20 * SEC);
    let result = if success { PromiseResult::Successful(vec![]) } else { PromiseResult::Failed };
    let mut builder = context(GATE, T0 + 25 * SEC, ZERO, 30);
    builder.predecessor_account_id(account(GATE));
    testing_env!(builder.build(), test_vm_config(), RuntimeFeesConfig::test(), Default::default(), vec![result]);
    contract.on_voted(account(DAO), proposal_id, U64(session_id), U128(amount), U64(window_id))
}

#[test]
fn a_rejected_vote_reopens_the_session_and_rolls_back_the_window() {
    let mut contract = gate();
    let key = session_key(b"fifteen-bytes!!", 4);
    let sid = open(&mut contract, 4, 10, &key);
    attest_as(&mut contract, "alice.testnet", &key, 4, sid, 10);
    attest_as(&mut contract, "bob.testnet", &key, 4, sid, 10);
    set("bob.testnet", T0 + 20 * SEC);
    let _ = contract.execute(account(DAO), 4);
    // A concurrent execute while the vote is in flight is refused.
    expect_panic("ERR_SESSION_BUSY", std::panic::AssertUnwindSafe(|| {
        let _ = contract.execute(account(DAO), 4);
    }));
    assert!(!accept_vote(&mut contract, 4, sid, 10, false));
    let view = contract.get_session(account(DAO), 4).unwrap();
    assert_eq!(view.status, "Open");
    assert_eq!(view.last_error.as_deref(), Some("ERR_VOTE_FAILED"));
    assert_eq!(contract.get_tiers(account(DAO)).window_spent.0, 0);
    assert_eq!(contract.get_participation(account(DAO), account("alice.testnet")).ceremonies, 0);
}

#[test]
fn an_accepted_vote_records_participation_and_closes_the_session() {
    let mut contract = gate();
    let key = session_key(b"fifteen-bytes!!", 9);
    let sid = open(&mut contract, 9, 10, &key);
    attest_as(&mut contract, "alice.testnet", &key, 9, sid, 10);
    attest_as(&mut contract, "carol.testnet", &key, 9, sid, 10);
    set("carol.testnet", T0 + 20 * SEC);
    let _ = contract.execute(account(DAO), 9);
    assert!(accept_vote(&mut contract, 9, sid, 10, true));
    // A late callback for an older session id is ignored.
    assert!(!accept_vote(&mut contract, 9, sid + 99, 10, false));
    let view = contract.get_session(account(DAO), 9).unwrap();
    assert_eq!(view.status, "Voted");
    let alice = contract.get_participation(account(DAO), account("alice.testnet"));
    assert_eq!((alice.ceremonies, alice.last_proposal_id), (1, 9));
    assert_eq!(contract.get_participation(account(DAO), account("bob.testnet")).ceremonies, 0);
    set("alice.testnet", T0 + 30 * SEC);
    expect_panic("ERR_SESSION_CLOSED", std::panic::AssertUnwindSafe(|| {
        let _ = contract.execute(account(DAO), 9);
    }));
    // Evidence pointers are deduplicated and capped; only eligible members may add them.
    for byte in [1u8, 1, 2, 3] {
        contract.record_evidence(account(DAO), 9, Base58CryptoHash::from([byte; 32]));
    }
    assert_eq!(contract.get_session(account(DAO), 9).unwrap().evidence_txs.len(), 3);
    expect_panic("ERR_EVIDENCE_FULL", std::panic::AssertUnwindSafe(|| {
        contract.record_evidence(account(DAO), 9, Base58CryptoHash::from([4u8; 32]));
    }));
    set("mallory.testnet", T0 + 30 * SEC);
    expect_panic("ERR_NOT_ELIGIBLE", std::panic::AssertUnwindSafe(|| {
        contract.record_evidence(account(DAO), 9, Base58CryptoHash::from([5u8; 32]));
    }));
}

#[test]
fn only_the_host_can_cancel_an_open_session() {
    let mut contract = gate();
    let key = session_key(b"fifteen-bytes!!", 3);
    open(&mut contract, 3, 10, &key);
    set("bob.testnet", T0 + 5 * SEC);
    expect_panic("ERR_NOT_HOST", std::panic::AssertUnwindSafe(|| contract.cancel_session(account(DAO), 3)));
    set("alice.testnet", T0 + 5 * SEC);
    contract.cancel_session(account(DAO), 3);
    assert_eq!(contract.get_session(account(DAO), 3).unwrap().status, "Cancelled");
}

// --------------------------------------------------------- opening and tiers

#[test]
fn open_session_validates_inputs_before_any_cross_contract_call() {
    let mut contract = gate();
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let deposit = NearToken::from_millinear(100);
    let cases: Vec<(&str, &str, u32, NearToken, u64)> = vec![
        ("ERR_DEPOSIT", DAO, 300, NearToken::from_millinear(99), 100),
        ("ERR_TTL", DAO, 0, deposit, 100),
        ("ERR_TTL", DAO, 601, deposit, 100),
        ("ERR_NOT_SPUTNIK_DAO", "team.testnet", 300, deposit, 100),
        ("ERR_NOT_SPUTNIK_DAO", "a.b.sputnikv2.testnet", 300, deposit, 100),
        ("ERR_GAS", DAO, 300, deposit, 50),
    ];
    for (expected, dao, ttl, attached, gas) in cases {
        testing_env!(context("alice.testnet", T0, attached, gas).build());
        let pk = pk.clone();
        expect_panic(expected, std::panic::AssertUnwindSafe(|| {
            let _ = contract.open_session(account(dao), 1, pk, ttl);
        }));
    }
}

#[test]
fn only_a_factory_dao_can_set_its_own_tiers() {
    let mut contract = gate();
    let tiers = || vec![TierInput { up_to: U128(tiers::ONE_NEAR), required: 2 }, TierInput { up_to: U128(5 * tiers::ONE_NEAR), required: 3 }];
    set("alice.testnet", T0);
    expect_panic("ERR_ONLY_DAO", std::panic::AssertUnwindSafe(|| contract.set_tiers(tiers(), 3_600)));
    set(DAO, T0);
    expect_panic("ERR_BAD_TIERS", std::panic::AssertUnwindSafe(|| {
        contract.set_tiers(vec![TierInput { up_to: U128(1), required: 1 }], 3_600)
    }));
    contract.set_tiers(tiers(), 3_600);
    let view = contract.get_tiers(account(DAO));
    assert!(view.custom);
    assert_eq!((view.version, view.window_secs, view.tiers.len()), (1, 3_600, 2));
    assert_eq!(contract.required_attendees(account(DAO), U128(2 * tiers::ONE_NEAR), 3), 3);
    assert_eq!(contract.required_attendees(account(DAO), U128(6 * tiers::ONE_NEAR), 3), 3);
    assert_eq!(contract.required_attendees(account(DAO), U128(6 * tiers::ONE_NEAR), 5), 5);
}
