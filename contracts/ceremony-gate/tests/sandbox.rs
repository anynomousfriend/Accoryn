//! Integration tests: the ceremony gate against the exact Sputnik DAO v2.3.1
//! code that sputnikv2.testnet deploys (fetched by scripts/fetch-sputnik-wasm.sh,
//! pinned by code hash). Run: ./scripts/fetch-sputnik-wasm.sh && cargo test

use ed25519_dalek::{Signer as _, SigningKey};
use near_api::{AccountId, NearGas, NearToken, NetworkConfig, Signer};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::{Arc, OnceLock};

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const GATE: &str = "gate.sandbox";
const DAO: &str = "team.factory.sandbox";
const MEMBERS: [&str; 3] = ["alice.sandbox", "bob.sandbox", "carol.sandbox"];
const PAYEE: &str = "payee.sandbox";
const MALLORY: &str = "mallory.sandbox";

type Outcome = near_api::types::transaction::result::ExecutionFinalResult;

fn gate_wasm() -> &'static [u8] {
    static WASM: OnceLock<Vec<u8>> = OnceLock::new();
    WASM.get_or_init(|| {
        let path = cargo_near_build::build_with_cli(Default::default()).expect("build gate wasm");
        std::fs::read(path).expect("read gate wasm")
    })
}

fn sputnik_wasm() -> Vec<u8> {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/res/sputnikdao2.wasm");
    std::fs::read(path).expect("missing tests/res/sputnikdao2.wasm: run ./scripts/fetch-sputnik-wasm.sh first")
}

fn id(text: &str) -> AccountId {
    text.parse().unwrap()
}

/// The gated policy the app creates (mirrors web/src/engines/near/policy.ts).
fn gated_policy(members: &[&str], gate: &str) -> Value {
    let governance = std::cmp::max(2, members.len() - 1).to_string();
    let kinds = [
        "config", "policy", "policy_add_or_update_role", "policy_remove_role", "policy_update_default_vote_policy",
        "policy_update_parameters", "add_member_to_role", "remove_member_from_role", "call", "factory_info_update",
    ];
    let actions = ["AddProposal", "VoteApprove", "VoteReject", "Finalize"];
    let admin: Vec<String> = kinds.iter().flat_map(|k| actions.iter().map(move |a| format!("{k}:{a}"))).collect();
    json!({
        "roles": [
            {"name": "Requestor", "kind": {"Group": members},
             "permissions": ["transfer:AddProposal", "transfer:VoteReject", "transfer:Finalize"],
             "vote_policy": {"transfer": {"weight_kind": "RoleWeight", "quorum": "0", "threshold": [1, 2]}}},
            {"name": "Admin", "kind": {"Group": members}, "permissions": admin, "vote_policy": {}},
            {"name": "Approver", "kind": {"Group": [gate]}, "permissions": ["transfer:VoteApprove"],
             "vote_policy": {"transfer": {"weight_kind": "RoleWeight", "quorum": "0", "threshold": "1"}}}
        ],
        "default_vote_policy": {"weight_kind": "RoleWeight", "quorum": "2", "threshold": governance},
        "proposal_bond": "0",
        "proposal_period": "259200000000000",
        "bounty_bond": "1000000000000000000000000",
        "bounty_forgiveness_period": "86400000000000"
    })
}

fn seed(proposal_id: u64, challenge: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    let pid = proposal_id.to_string();
    let parts: [&[u8]; 5] = [b"accoryn-ceremony-seed-v1", GATE.as_bytes(), DAO.as_bytes(), pid.as_bytes(), challenge];
    for (i, part) in parts.iter().enumerate() {
        if i > 0 {
            hasher.update([0u8]);
        }
        hasher.update(part);
    }
    hasher.finalize().into()
}

fn attestation(key: &SigningKey, proposal_id: u64, session_id: u64, amount: u128, attendee: &str) -> String {
    let message = [
        "accoryn-ceremony-attest-v1", GATE, DAO, &proposal_id.to_string(), &session_id.to_string(), PAYEE,
        &amount.to_string(), attendee,
    ]
    .join("\0");
    use near_sdk::base64::Engine as _;
    near_sdk::base64::engine::general_purpose::STANDARD.encode(key.sign(message.as_bytes()).to_bytes())
}

fn near_pk(key: &SigningKey) -> String {
    format!("ed25519:{}", near_sdk::bs58::encode(key.verifying_key().as_bytes()).into_string())
}

struct World {
    _sandbox: near_sandbox::Sandbox,
    net: NetworkConfig,
    signer: Arc<Signer>,
}

impl World {
    async fn new(dao_balance_near: u128, create_payee: bool) -> testresult::TestResult<Self> {
        let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
        let net = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
        let signer = Signer::from_secret_key(near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
        for name in MEMBERS.iter().chain([MALLORY].iter()) {
            sandbox.create_account(id(name)).initial_balance(NearToken::from_near(100)).send().await?;
        }
        if create_payee {
            sandbox.create_account(id(PAYEE)).initial_balance(NearToken::from_near(1)).send().await?;
        }
        sandbox.create_account(id(GATE)).initial_balance(NearToken::from_near(50)).send().await?;
        sandbox
            .create_account(id(DAO))
            .initial_balance(NearToken::from_yoctonear(dao_balance_near * NEAR))
            .send()
            .await?;
        near_api::Contract::deploy(id(GATE))
            .use_code(gate_wasm().to_vec())
            .with_init_call(
                "new",
                json!({"factory_suffix": "factory.sandbox", "min_ttl_secs": 1, "max_ttl_secs": 600,
                       "session_deposit": (NEAR / 10).to_string()}),
            )?
            .with_signer(signer.clone())
            .send_to(&net)
            .await?
            .assert_success();
        near_api::Contract::deploy(id(DAO))
            .use_code(sputnik_wasm())
            .with_init_call(
                "new",
                json!({"config": {"name": "team", "purpose": "sandbox", "metadata": ""},
                       "policy": gated_policy(&MEMBERS, GATE)}),
            )?
            .with_signer(signer.clone())
            .send_to(&net)
            .await?
            .assert_success();
        Ok(Self { _sandbox: sandbox, net, signer })
    }

    async fn create(&self, account: &str, near: u128) {
        self._sandbox.create_account(id(account)).initial_balance(NearToken::from_near(near)).send().await.expect("create account");
    }

    async fn fund(&self, account: &str, near: u128) {
        near_api::Tokens::account(id(MALLORY))
            .send_to(id(account))
            .near(NearToken::from_near(near))
            .with_signer(self.signer.clone())
            .send_to(&self.net)
            .await
            .expect("transfer")
            .assert_success();
    }

    async fn call(&self, who: &str, contract: &str, method: &str, args: Value, deposit: u128, tgas: u64) -> Outcome {
        near_api::Contract(id(contract))
            .call_function(method, args)
            .transaction()
            .gas(NearGas::from_tgas(tgas))
            .deposit(NearToken::from_yoctonear(deposit))
            .with_signer(id(who), self.signer.clone())
            .send_to(&self.net)
            .await
            .expect("transaction submission")
            .into_full()
            .expect("final outcome")
    }

    async fn view(&self, contract: &str, method: &str, args: Value) -> Value {
        near_api::Contract(id(contract))
            .call_function(method, args)
            .read_only::<Value>()
            .fetch_from(&self.net)
            .await
            .expect("view")
            .data
    }

    async fn balance(&self, account: &str) -> u128 {
        near_api::Tokens::account(id(account)).near_balance().fetch_from(&self.net).await.expect("balance").total.as_yoctonear()
    }

    async fn propose_transfer(&self, who: &str, amount: u128) -> u64 {
        let outcome = self
            .call(who, DAO, "add_proposal",
                json!({"proposal": {"description": "invoice payout", "kind": {"Transfer": {"token_id": "", "receiver_id": PAYEE, "amount": amount.to_string()}}}}),
                0, 50)
            .await;
        outcome.assert_success().json::<u64>().expect("proposal id")
    }

    async fn proposal(&self, proposal_id: u64) -> Value {
        self.view(DAO, "get_proposal", json!({"id": proposal_id})).await
    }

    async fn session(&self, proposal_id: u64) -> Value {
        self.view(GATE, "get_session", json!({"dao_id": DAO, "proposal_id": proposal_id})).await
    }

    async fn open(&self, host: &str, proposal_id: u64, key: &SigningKey) -> Outcome {
        self.call(host, GATE, "open_session",
            json!({"dao_id": DAO, "proposal_id": proposal_id, "session_pk": near_pk(key), "ttl_secs": 300}),
            NEAR / 10, 100)
        .await
    }

    async fn attest(&self, who: &str, proposal_id: u64, key: &SigningKey, session_id: u64, amount: u128) -> Outcome {
        self.call(who, GATE, "attest",
            json!({"dao_id": DAO, "proposal_id": proposal_id, "signature": attestation(key, proposal_id, session_id, amount, who)}),
            0, 30)
        .await
    }

    async fn execute(&self, who: &str, proposal_id: u64) -> Outcome {
        self.call(who, GATE, "execute", json!({"dao_id": DAO, "proposal_id": proposal_id}), 0, 300).await
    }
}

fn failed_with(outcome: Outcome, code: &str) {
    let text = format!("{outcome:?}");
    assert!(text.contains(code), "expected failure {code}, got: {}", &text[..text.len().min(1500)]);
    outcome.assert_failure();
}

fn session_id(session: &Value) -> u64 {
    session["session_id"].as_str().unwrap().parse().unwrap()
}

#[tokio::test]
async fn ceremony_attestations_approve_and_pay_a_small_transfer() -> testresult::TestResult<()> {
    let world = World::new(20, true).await?;
    let amount = NEAR / 2;
    let proposal_id = world.propose_transfer("alice.sandbox", amount).await;

    // No human can approve a transfer directly.
    let kind = json!({"Transfer": {"token_id": "", "receiver_id": PAYEE, "amount": amount.to_string()}});
    failed_with(
        world.call("bob.sandbox", DAO, "act_proposal", json!({"id": proposal_id, "action": "VoteApprove", "proposal": kind}), 0, 200).await,
        "ERR_PERMISSION_DENIED",
    );

    let key = SigningKey::from_bytes(&seed(proposal_id, b"fifteen-bytes!!"));
    world.open("alice.sandbox", proposal_id, &key).await.assert_success();
    let session = world.session(proposal_id).await;
    assert_eq!(session["status"], "Open");
    assert_eq!(session["required"], 2);
    assert_eq!(session["eligible"].as_array().unwrap().len(), 3);
    let sid = session_id(&session);

    failed_with(world.attest(MALLORY, proposal_id, &key, sid, amount).await, "ERR_NOT_ELIGIBLE");
    world.attest("alice.sandbox", proposal_id, &key, sid, amount).await.assert_success();
    failed_with(world.execute("alice.sandbox", proposal_id).await, "ERR_NOT_ENOUGH_ATTENDEES");
    world.attest("bob.sandbox", proposal_id, &key, sid, amount).await.assert_success();

    let before = world.balance(PAYEE).await;
    let outcome = world.execute("carol.sandbox", proposal_id).await;
    assert!(outcome.logs().iter().any(|log| log.contains("\"vote_submitted\"")), "{:?}", outcome.logs());
    outcome.assert_success();
    assert_eq!(world.proposal(proposal_id).await["status"], "Approved");
    assert_eq!(world.balance(PAYEE).await, before + amount, "recipient receives exactly the proposal amount");

    let session = world.session(proposal_id).await;
    assert_eq!(session["status"], "Voted");
    let record = world.view(GATE, "get_participation", json!({"dao_id": DAO, "account_id": "alice.sandbox"})).await;
    assert_eq!(record["ceremonies"], 1);
    let record = world.view(GATE, "get_participation", json!({"dao_id": DAO, "account_id": "carol.sandbox"})).await;
    assert_eq!(record["ceremonies"], 0);
    failed_with(world.execute("alice.sandbox", proposal_id).await, "ERR_SESSION_CLOSED");
    failed_with(world.open("alice.sandbox", proposal_id, &key).await, "ERR_ALREADY_VOTED");
    Ok(())
}

#[tokio::test]
async fn larger_amounts_need_more_attendees_and_unsuitable_requests_are_refused() -> testresult::TestResult<()> {
    let world = World::new(30, true).await?;
    let amount = 2 * NEAR;
    let proposal_id = world.propose_transfer("bob.sandbox", amount).await;
    let key = SigningKey::from_bytes(&seed(proposal_id, b"second-session!"));
    world.open("bob.sandbox", proposal_id, &key).await.assert_success();
    let sid = session_id(&world.session(proposal_id).await);
    assert_eq!(world.session(proposal_id).await["required"], 3);
    for who in ["alice.sandbox", "bob.sandbox"] {
        world.attest(who, proposal_id, &key, sid, amount).await.assert_success();
    }
    failed_with(world.execute("bob.sandbox", proposal_id).await, "ERR_NOT_ENOUGH_ATTENDEES");
    world.attest("carol.sandbox", proposal_id, &key, sid, amount).await.assert_success();
    world.execute("bob.sandbox", proposal_id).await.assert_success();
    assert_eq!(world.proposal(proposal_id).await["status"], "Approved");

    // A FunctionCall proposal is refused in the callback and the deposit refunded.
    let call = world
        .call("alice.sandbox", DAO, "add_proposal",
            json!({"proposal": {"description": "not a payment", "kind": {"FunctionCall": {"receiver_id": PAYEE,
                "actions": [{"method_name": "x", "args": "e30=", "deposit": "0", "gas": "5000000000000"}]}}}}),
            0, 50)
        .await
        .assert_success()
        .json::<u64>()?;
    let before = world.balance("alice.sandbox").await;
    let key2 = SigningKey::from_bytes(&seed(call, b"third-session!!"));
    let outcome = world.open("alice.sandbox", call, &key2).await;
    assert!(outcome.logs().iter().any(|log| log.contains("ERR_NOT_TRANSFER")), "{:?}", outcome.logs());
    outcome.assert_success();
    assert!(world.session(call).await.is_null());
    let spent = before - world.balance("alice.sandbox").await;
    assert!(spent < NEAR / 100, "deposit refunded; only gas spent ({spent})");

    failed_with(
        world.call("alice.sandbox", GATE, "open_session",
            json!({"dao_id": "alice.sandbox", "proposal_id": 0, "session_pk": near_pk(&key2), "ttl_secs": 300}), NEAR / 10, 100).await,
        "ERR_NOT_SPUTNIK_DAO",
    );
    Ok(())
}

#[tokio::test]
async fn members_can_reject_mid_ceremony_and_governance_changes_disable_the_gate() -> testresult::TestResult<()> {
    let world = World::new(20, true).await?;
    let amount = NEAR / 2;
    let proposal_id = world.propose_transfer("alice.sandbox", amount).await;
    let key = SigningKey::from_bytes(&seed(proposal_id, b"fifteen-bytes!!"));
    world.open("alice.sandbox", proposal_id, &key).await.assert_success();
    let sid = session_id(&world.session(proposal_id).await);
    for who in ["alice.sandbox", "bob.sandbox"] {
        world.attest(who, proposal_id, &key, sid, amount).await.assert_success();
    }
    // A majority of requestors rejects before execution.
    let kind = json!({"Transfer": {"token_id": "", "receiver_id": PAYEE, "amount": amount.to_string()}});
    for who in ["bob.sandbox", "carol.sandbox"] {
        world.call(who, DAO, "act_proposal", json!({"id": proposal_id, "action": "VoteReject", "proposal": kind}), 0, 200)
            .await
            .assert_success();
    }
    assert_eq!(world.proposal(proposal_id).await["status"], "Rejected");
    let before = world.balance(PAYEE).await;
    let outcome = world.execute("alice.sandbox", proposal_id).await;
    assert!(outcome.logs().iter().any(|log| log.contains("\"vote_failed\"")), "{:?}", outcome.logs());
    let session = world.session(proposal_id).await;
    assert_eq!(session["status"], "Open");
    assert_eq!(session["last_error"], "ERR_VOTE_FAILED");
    assert_eq!(world.balance(PAYEE).await, before, "nothing paid");
    assert_eq!(world.view(GATE, "get_tiers", json!({"dao_id": DAO})).await["window_spent"], "0");

    // Governance escape hatch (disclosed): G = 2 of 3 members can add a human approver...
    let add = json!({"AddMemberToRole": {"member_id": MALLORY, "role": "Approver"}});
    let gov = world
        .call("alice.sandbox", DAO, "add_proposal", json!({"proposal": {"description": "add approver", "kind": add}}), 0, 50)
        .await
        .assert_success()
        .json::<u64>()?;
    world.call("alice.sandbox", DAO, "act_proposal", json!({"id": gov, "action": "VoteApprove", "proposal": add}), 0, 200)
        .await
        .assert_success();
    assert_eq!(world.proposal(gov).await["status"], "InProgress", "one admin vote is not enough");
    world.call("bob.sandbox", DAO, "act_proposal", json!({"id": gov, "action": "VoteApprove", "proposal": add}), 0, 200)
        .await
        .assert_success();
    assert_eq!(world.proposal(gov).await["status"], "Approved");
    // ...after which the gate refuses to run ceremonies for the now-ungated policy.
    let next = world.propose_transfer("alice.sandbox", amount).await;
    let key2 = SigningKey::from_bytes(&seed(next, b"after-policy!!!"));
    let outcome = world.open("alice.sandbox", next, &key2).await;
    assert!(outcome.logs().iter().any(|log| log.contains("ERR_POLICY_NOT_GATED")), "{:?}", outcome.logs());
    assert!(world.session(next).await.is_null());
    Ok(())
}

#[tokio::test]
async fn an_underfunded_vote_reverts_and_the_same_ceremony_can_execute_after_funding() -> testresult::TestResult<()> {
    // The DAO keeps ~5.4 NEAR locked for its own storage; 9 NEAR leaves ~3.6 NEAR spendable.
    let world = World::new(9, true).await?;
    let amount = 5 * NEAR;
    let proposal_id = world.propose_transfer("alice.sandbox", amount).await;
    let key = SigningKey::from_bytes(&seed(proposal_id, b"fifteen-bytes!!"));
    world.open("alice.sandbox", proposal_id, &key).await.assert_success();
    let sid = session_id(&world.session(proposal_id).await);
    for who in MEMBERS {
        world.attest(who, proposal_id, &key, sid, amount).await.assert_success();
    }
    let before = world.balance(PAYEE).await;
    let outcome = world.execute("alice.sandbox", proposal_id).await;
    // Observed on DAO v2.3.1: the DAO receipt fails with LackBalanceForState, reverting the vote.
    assert!(format!("{:?}", outcome.receipt_failures()).contains("LackBalanceForState"));
    assert!(outcome.logs().iter().any(|log| log.contains("\"vote_failed\"")), "{:?}", outcome.logs());
    assert_eq!(world.proposal(proposal_id).await["status"], "InProgress");
    assert_eq!(world.balance(PAYEE).await, before, "no payment while underfunded");
    let session = world.session(proposal_id).await;
    assert_eq!((session["status"].as_str(), session["last_error"].as_str()), (Some("Open"), Some("ERR_VOTE_FAILED")));
    assert_eq!(world.view(GATE, "get_tiers", json!({"dao_id": DAO})).await["window_spent"], "0");

    world.fund(DAO, 10).await;
    world.execute("bob.sandbox", proposal_id).await.assert_success();
    assert_eq!(world.proposal(proposal_id).await["status"], "Approved");
    assert_eq!(world.balance(PAYEE).await, before + amount);
    failed_with(world.execute("carol.sandbox", proposal_id).await, "ERR_SESSION_CLOSED");
    assert_eq!(world.balance(PAYEE).await, before + amount, "paid exactly once");
    Ok(())
}

#[tokio::test]
async fn a_failed_transfer_is_marked_failed_and_a_member_can_retry_it_once() -> testresult::TestResult<()> {
    // The payee account does not exist yet, so the DAO's transfer receipt fails after the vote.
    let world = World::new(20, false).await?;
    let amount = NEAR / 2;
    let proposal_id = world.propose_transfer("alice.sandbox", amount).await;
    let key = SigningKey::from_bytes(&seed(proposal_id, b"fifteen-bytes!!"));
    world.open("alice.sandbox", proposal_id, &key).await.assert_success();
    let sid = session_id(&world.session(proposal_id).await);
    for who in ["alice.sandbox", "bob.sandbox"] {
        world.attest(who, proposal_id, &key, sid, amount).await.assert_success();
    }
    let _ = world.execute("alice.sandbox", proposal_id).await;
    assert_eq!(world.proposal(proposal_id).await["status"], "Failed");
    // The gate saw its vote accepted; settlement truth comes from the proposal and transaction outcome.
    assert_eq!(world.session(proposal_id).await["status"], "Voted");

    world.create(PAYEE, 1).await;
    let before = world.balance(PAYEE).await;
    let kind = json!({"Transfer": {"token_id": "", "receiver_id": PAYEE, "amount": amount.to_string()}});
    world.call("bob.sandbox", DAO, "act_proposal", json!({"id": proposal_id, "action": "Finalize", "proposal": kind}), 0, 200)
        .await
        .assert_success();
    assert_eq!(world.proposal(proposal_id).await["status"], "Approved");
    assert_eq!(world.balance(PAYEE).await, before + amount);
    world.call("carol.sandbox", DAO, "act_proposal", json!({"id": proposal_id, "action": "Finalize", "proposal": kind}), 0, 200)
        .await
        .assert_failure();
    assert_eq!(world.balance(PAYEE).await, before + amount, "paid exactly once");
    Ok(())
}
