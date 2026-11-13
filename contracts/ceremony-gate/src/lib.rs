//! Accoryn ceremony gate.
//!
//! A Sputnik DAO grants this contract — and nobody else — permission to approve
//! transfer proposals. The gate approves a transfer only after enough eligible
//! members attest, from their own accounts, that they received the fresh
//! challenge broadcast during an in-person ceremony. The number of attendees
//! required grows with the cumulative amount approved in the current window.
//!
//! What this does NOT prove: physical proximity (sound can be relayed live),
//! distinct humans (one person may control several member accounts), or that a
//! device's key is uncompromised. Governance (G members) can change the DAO
//! policy and remove the gate; that escape hatch is intentional and disclosed.
//! See docs/security/ceremony-threat-model.md.

use near_sdk::json_types::{Base58CryptoHash, Base64VecU8, U128, U64};
use near_sdk::serde_json::{self, json, Value};
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, CryptoHash, CurveType, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError, PublicKey,
};

pub mod protocol;
pub mod sputnik;
pub mod tiers;

use tiers::TierConfig;

const NS_PER_SEC: u64 = 1_000_000_000;
const GAS_VIEW_PROPOSAL: Gas = Gas::from_tgas(10);
const GAS_VIEW_POLICY: Gas = Gas::from_tgas(20);
const GAS_ON_CONTEXT: Gas = Gas::from_tgas(40);
const GAS_OPEN_MIN: Gas = Gas::from_tgas(90);
const GAS_ACT_PROPOSAL: Gas = Gas::from_tgas(150);
const GAS_ON_VOTED: Gas = Gas::from_tgas(30);
const GAS_EXECUTE_MIN: Gas = Gas::from_tgas(250);
const MAX_VIEW_BYTES: usize = 64 * 1024;
const STALE_EXECUTING_NS: u64 = 120 * NS_PER_SEC;
const MAX_EVIDENCE: usize = 3;
const MAX_TTL_LIMIT_SECS: u32 = 3_600;
const ZERO: NearToken = NearToken::from_yoctonear(0);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Sessions,
    Tiers,
    Windows,
    Participation,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub enum Status {
    Open,
    Executing { since: u64, window_id: u64 },
    Voted { at: u64 },
    Cancelled,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Session {
    pub session_id: u64,
    pub host: AccountId,
    pub session_pk: PublicKey,
    pub receiver_id: AccountId,
    pub amount: u128,
    pub kind_json: String,
    pub eligible: Vec<AccountId>,
    pub attestations: Vec<(AccountId, u64)>,
    pub opened_at: u64,
    pub expires_at: u64,
    pub status: Status,
    pub last_error: Option<String>,
    pub evidence_txs: Vec<CryptoHash>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, Default)]
pub struct SpendWindow {
    pub window_id: u64,
    pub spent: u128,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, Default)]
pub struct Participation {
    pub ceremonies: u32,
    pub last_at: u64,
    pub last_proposal_id: u64,
}

#[near(serializers = [json])]
pub struct AttestationView {
    pub account_id: AccountId,
    pub at: U64,
}

#[near(serializers = [json])]
pub struct SessionView {
    pub session_id: U64,
    pub dao_id: AccountId,
    pub proposal_id: u64,
    pub host: AccountId,
    pub session_pk: PublicKey,
    pub receiver_id: AccountId,
    pub amount: U128,
    pub eligible: Vec<AccountId>,
    pub attestations: Vec<AttestationView>,
    /// Attendees currently required, given the spend window at view time.
    pub required: u8,
    pub opened_at: U64,
    pub expires_at: U64,
    /// "Open" | "Expired" | "Executing" | "Voted" | "Cancelled"
    pub status: String,
    pub last_error: Option<String>,
    pub evidence_txs: Vec<Base58CryptoHash>,
}

#[near(serializers = [json])]
pub struct TierInput {
    pub up_to: U128,
    pub required: u8,
}

#[near(serializers = [json])]
pub struct TiersView {
    pub tiers: Vec<TierInput>,
    pub window_secs: u32,
    pub version: u32,
    pub custom: bool,
    pub window_id: U64,
    pub window_spent: U128,
}

#[near(serializers = [json])]
pub struct ParticipationView {
    pub ceremonies: u32,
    pub last_at: U64,
    pub last_proposal_id: u64,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub factory_suffix: String,
    pub min_ttl_secs: u32,
    pub max_ttl_secs: u32,
    pub session_deposit: U128,
    pub next_session_id: U64,
}

fn emit(event: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": "accoryn_ceremony", "version": "1.0.0", "event": event, "data": [data]})
    ));
}

fn now() -> u64 {
    env::block_timestamp()
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct CeremonyGate {
    factory_suffix: String,
    min_ttl_ns: u64,
    max_ttl_ns: u64,
    session_deposit: NearToken,
    next_session_id: u64,
    sessions: LookupMap<(AccountId, u64), Session>,
    tiers: LookupMap<AccountId, TierConfig>,
    windows: LookupMap<AccountId, SpendWindow>,
    participation: LookupMap<(AccountId, AccountId), Participation>,
}

#[near]
impl CeremonyGate {
    #[init]
    pub fn new(factory_suffix: String, min_ttl_secs: u32, max_ttl_secs: u32, session_deposit: U128) -> Self {
        require!(factory_suffix.parse::<AccountId>().is_ok(), "ERR_BAD_CONFIG");
        require!(
            min_ttl_secs >= 1 && min_ttl_secs <= max_ttl_secs && max_ttl_secs <= MAX_TTL_LIMIT_SECS,
            "ERR_BAD_CONFIG"
        );
        Self {
            factory_suffix,
            min_ttl_ns: min_ttl_secs as u64 * NS_PER_SEC,
            max_ttl_ns: max_ttl_secs as u64 * NS_PER_SEC,
            session_deposit: NearToken::from_yoctonear(session_deposit.0),
            next_session_id: 1,
            sessions: LookupMap::new(StorageKey::Sessions),
            tiers: LookupMap::new(StorageKey::Tiers),
            windows: LookupMap::new(StorageKey::Windows),
            participation: LookupMap::new(StorageKey::Participation),
        }
    }

    // ---------------------------------------------------------------- sessions

    /// Opens a ceremony for one DAO transfer proposal. The host must be an
    /// eligible member. `session_pk` is the public half of the key derived from
    /// the acoustic challenge; the challenge itself is never sent on-chain.
    /// The deposit prepays session storage; it is refunded in full on rejection.
    #[payable]
    pub fn open_session(&mut self, dao_id: AccountId, proposal_id: u64, session_pk: PublicKey, ttl_secs: u32) -> Promise {
        let deposit = env::attached_deposit();
        require!(deposit >= self.session_deposit, "ERR_DEPOSIT");
        let ttl_ns = ttl_secs as u64 * NS_PER_SEC;
        require!(ttl_ns >= self.min_ttl_ns && ttl_ns <= self.max_ttl_ns, "ERR_TTL");
        require!(self.is_dao(&dao_id), "ERR_NOT_SPUTNIK_DAO");
        require!(
            session_pk.curve_type() == CurveType::ED25519 && session_pk.as_bytes().len() == 33,
            "ERR_BAD_PK"
        );
        require!(env::prepaid_gas() >= GAS_OPEN_MIN, "ERR_GAS");
        if let Some(existing) = self.sessions.get(&(dao_id.clone(), proposal_id)) {
            require!(!matches!(existing.status, Status::Voted { .. }), "ERR_ALREADY_VOTED");
            require!(!Self::is_live(existing), "ERR_SESSION_ACTIVE");
        }
        let host = env::predecessor_account_id();
        let callback_args = json!({
            "dao_id": dao_id,
            "proposal_id": proposal_id,
            "host": host,
            "session_pk": session_pk,
            "ttl_ns": U64(ttl_ns),
            "deposit": U128(deposit.as_yoctonear()),
        });
        Promise::new(dao_id.clone())
            .function_call("get_proposal", json!({ "id": proposal_id }).to_string().into_bytes(), ZERO, GAS_VIEW_PROPOSAL)
            .and(Promise::new(dao_id).function_call("get_policy", b"{}".to_vec(), ZERO, GAS_VIEW_POLICY))
            .then(Promise::new(env::current_account_id()).function_call(
                "on_session_context",
                callback_args.to_string().into_bytes(),
                ZERO,
                GAS_ON_CONTEXT,
            ))
    }

    /// Never panics on expected failures: it refunds the deposit and returns None.
    #[private]
    pub fn on_session_context(
        &mut self,
        dao_id: AccountId,
        proposal_id: u64,
        host: AccountId,
        session_pk: PublicKey,
        ttl_ns: U64,
        deposit: U128,
    ) -> Option<SessionView> {
        match self.store_session(&dao_id, proposal_id, &host, session_pk, ttl_ns.0) {
            Ok(view) => {
                let excess = deposit.0.saturating_sub(self.session_deposit.as_yoctonear());
                if excess > 0 {
                    Promise::new(host).transfer(NearToken::from_yoctonear(excess)).detach();
                }
                Some(view)
            }
            Err(reason) => {
                emit(
                    "session_rejected",
                    json!({"dao_id": dao_id, "proposal_id": proposal_id, "host": host, "reason": reason}),
                );
                if deposit.0 > 0 {
                    Promise::new(host).transfer(NearToken::from_yoctonear(deposit.0)).detach();
                }
                None
            }
        }
    }

    /// An eligible member attests, from their own account, that they received
    /// the ceremony challenge: `signature` is the session key's signature over
    /// the attestation message bound to this payment and this attendee.
    pub fn attest(&mut self, dao_id: AccountId, proposal_id: u64, signature: Base64VecU8) -> u32 {
        let attendee = env::predecessor_account_id();
        let key = (dao_id.clone(), proposal_id);
        let mut session = self.sessions.get(&key).cloned().unwrap_or_else(|| env::panic_str("ERR_NO_SESSION"));
        require!(session.status == Status::Open, "ERR_SESSION_CLOSED");
        require!(now() < session.expires_at, "ERR_SESSION_EXPIRED");
        require!(session.eligible.contains(&attendee), "ERR_NOT_ELIGIBLE");
        require!(!session.attestations.iter().any(|(account, _)| account == &attendee), "ERR_ALREADY_ATTESTED");
        let signature: [u8; 64] =
            signature.0.as_slice().try_into().unwrap_or_else(|_| env::panic_str("ERR_BAD_SIGNATURE"));
        let public_key: [u8; 32] = session.session_pk.as_bytes()[1..].try_into().unwrap();
        let message = protocol::attestation_message(
            env::current_account_id().as_str(),
            dao_id.as_str(),
            proposal_id,
            session.session_id,
            session.receiver_id.as_str(),
            session.amount,
            attendee.as_str(),
        );
        require!(env::ed25519_verify(&signature, &message, &public_key), "ERR_BAD_SIGNATURE");
        session.attestations.push((attendee.clone(), now()));
        let count = session.attestations.len() as u32;
        let required = self.required_now(&dao_id, &session);
        emit(
            "attested",
            json!({"dao_id": dao_id, "proposal_id": proposal_id, "session_id": U64(session.session_id),
                   "account_id": attendee, "count": count, "required": required}),
        );
        self.sessions.insert(key, session);
        count
    }

    /// Any eligible member may trigger the vote once enough members attested.
    /// The gate passes the stored proposal kind back to the DAO, which rejects
    /// any mismatch, non-in-progress proposal or duplicate vote itself.
    pub fn execute(&mut self, dao_id: AccountId, proposal_id: u64) -> Promise {
        require!(env::prepaid_gas() >= GAS_EXECUTE_MIN, "ERR_GAS");
        let caller = env::predecessor_account_id();
        let key = (dao_id.clone(), proposal_id);
        let mut session = self.sessions.get(&key).cloned().unwrap_or_else(|| env::panic_str("ERR_NO_SESSION"));
        require!(session.eligible.contains(&caller), "ERR_NOT_ELIGIBLE");
        let current = now();
        let retry_window = match session.status {
            Status::Open => None,
            Status::Executing { since, window_id } if current >= since + STALE_EXECUTING_NS => Some(window_id),
            Status::Executing { .. } => env::panic_str("ERR_SESSION_BUSY"),
            _ => env::panic_str("ERR_SESSION_CLOSED"),
        };
        require!(current < session.expires_at, "ERR_SESSION_EXPIRED");

        let config = self.tier_config(&dao_id);
        let window_id = config.window_id(current);
        let mut window = self.windows.get(&dao_id).cloned().unwrap_or_default();
        if window.window_id != window_id {
            window = SpendWindow { window_id, spent: 0 };
        }
        // A stale in-flight attempt already counted its amount; do not count it twice.
        if retry_window == Some(window_id) {
            window.spent = window.spent.saturating_sub(session.amount);
        }
        let cumulative =
            window.spent.checked_add(session.amount).unwrap_or_else(|| env::panic_str("ERR_AMOUNT_OVERFLOW"));
        let required = config.required(cumulative, session.eligible.len());
        let count = session.attestations.len();
        require!(count >= required as usize, "ERR_NOT_ENOUGH_ATTENDEES");

        window.spent = cumulative;
        self.windows.insert(dao_id.clone(), window);
        session.status = Status::Executing { since: current, window_id };
        session.last_error = None;
        let session_id = session.session_id;
        let amount = session.amount;
        let kind: Value = serde_json::from_str(&session.kind_json).unwrap_or_else(|_| env::panic_str("ERR_BAD_JSON"));
        self.sessions.insert(key, session);
        emit(
            "execute_started",
            json!({"dao_id": dao_id, "proposal_id": proposal_id, "session_id": U64(session_id),
                   "executor": caller, "required": required, "count": count}),
        );
        let memo = format!("accoryn-ceremony:v1:session={session_id}:attendees={count}");
        Promise::new(dao_id.clone())
            .function_call(
                "act_proposal",
                json!({"id": proposal_id, "action": "VoteApprove", "proposal": kind, "memo": memo})
                    .to_string()
                    .into_bytes(),
                ZERO,
                GAS_ACT_PROPOSAL,
            )
            .then(Promise::new(env::current_account_id()).function_call(
                "on_voted",
                json!({"dao_id": dao_id, "proposal_id": proposal_id, "session_id": U64(session_id),
                       "amount": U128(amount), "window_id": U64(window_id)})
                .to_string()
                .into_bytes(),
                ZERO,
                GAS_ON_VOTED,
            ))
    }

    /// Records whether the DAO accepted the gate's vote. A successful vote is
    /// not proof of payment: Sputnik executes the transfer in a detached
    /// receipt, so clients verify settlement from the transaction outcome.
    #[private]
    pub fn on_voted(&mut self, dao_id: AccountId, proposal_id: u64, session_id: U64, amount: U128, window_id: U64) -> bool {
        let accepted = match env::promise_result_checked(0, 1_024) {
            Ok(_) | Err(PromiseError::TooLong(_)) => true,
            Err(_) => false,
        };
        let key = (dao_id.clone(), proposal_id);
        let Some(mut session) = self.sessions.get(&key).cloned() else { return false };
        if session.session_id != session_id.0 || !matches!(session.status, Status::Executing { .. }) {
            return false;
        }
        let current = now();
        if accepted {
            session.status = Status::Voted { at: current };
            for (account, _) in &session.attestations {
                let participant = (dao_id.clone(), account.clone());
                let mut record = self.participation.get(&participant).cloned().unwrap_or_default();
                record.ceremonies = record.ceremonies.saturating_add(1);
                record.last_at = current;
                record.last_proposal_id = proposal_id;
                self.participation.insert(participant, record);
            }
            emit(
                "vote_submitted",
                json!({"dao_id": dao_id, "proposal_id": proposal_id, "session_id": session_id,
                       "attendees": session.attestations.iter().map(|(a, _)| a.clone()).collect::<Vec<_>>()}),
            );
        } else {
            session.status = Status::Open;
            session.last_error = Some("ERR_VOTE_FAILED".into());
            if let Some(window) = self.windows.get_mut(&dao_id)
                && window.window_id == window_id.0
            {
                window.spent = window.spent.saturating_sub(amount.0);
            }
            emit(
                "vote_failed",
                json!({"dao_id": dao_id, "proposal_id": proposal_id, "session_id": session_id, "reason": "ERR_VOTE_FAILED"}),
            );
        }
        self.sessions.insert(key, session);
        accepted
    }

    /// The host may abandon an open session (for example after a bad broadcast).
    pub fn cancel_session(&mut self, dao_id: AccountId, proposal_id: u64) {
        let key = (dao_id.clone(), proposal_id);
        let mut session = self.sessions.get(&key).cloned().unwrap_or_else(|| env::panic_str("ERR_NO_SESSION"));
        require!(env::predecessor_account_id() == session.host, "ERR_NOT_HOST");
        require!(session.status == Status::Open, "ERR_SESSION_CLOSED");
        session.status = Status::Cancelled;
        emit(
            "session_cancelled",
            json!({"dao_id": dao_id, "proposal_id": proposal_id, "session_id": U64(session.session_id)}),
        );
        self.sessions.insert(key, session);
    }

    /// Stores an untrusted pointer to the settlement transaction so other
    /// members can find and independently verify it.
    pub fn record_evidence(&mut self, dao_id: AccountId, proposal_id: u64, tx_hash: Base58CryptoHash) {
        let key = (dao_id.clone(), proposal_id);
        let mut session = self.sessions.get(&key).cloned().unwrap_or_else(|| env::panic_str("ERR_NO_SESSION"));
        require!(session.eligible.contains(&env::predecessor_account_id()), "ERR_NOT_ELIGIBLE");
        require!(matches!(session.status, Status::Voted { .. }), "ERR_SESSION_CLOSED");
        let hash: CryptoHash = tx_hash.into();
        if session.evidence_txs.contains(&hash) {
            return;
        }
        require!(session.evidence_txs.len() < MAX_EVIDENCE, "ERR_EVIDENCE_FULL");
        session.evidence_txs.push(hash);
        emit(
            "evidence_recorded",
            json!({"dao_id": dao_id, "proposal_id": proposal_id, "tx_hash": Base58CryptoHash::from(hash)}),
        );
        self.sessions.insert(key, session);
    }

    // ------------------------------------------------------------------ tiers

    /// Only the DAO itself (through an approved FunctionCall proposal) can set
    /// its tiers, so changing spending rules is itself a governance decision.
    pub fn set_tiers(&mut self, tiers: Vec<TierInput>, window_secs: u32) {
        let dao_id = env::predecessor_account_id();
        require!(self.is_dao(&dao_id), "ERR_ONLY_DAO");
        let version = self.tiers.get(&dao_id).map_or(0, |config| config.version) + 1;
        let pairs: Vec<(u128, u8)> = tiers.iter().map(|tier| (tier.up_to.0, tier.required)).collect();
        let config = TierConfig::from_input(&pairs, window_secs, version).unwrap_or_else(|error| env::panic_str(error));
        self.tiers.insert(dao_id.clone(), config);
        emit("tiers_updated", json!({"dao_id": dao_id, "version": version}));
    }

    // ------------------------------------------------------------------ views

    pub fn get_session(&self, dao_id: AccountId, proposal_id: u64) -> Option<SessionView> {
        self.sessions.get(&(dao_id.clone(), proposal_id)).map(|session| self.view(&dao_id, proposal_id, session))
    }

    pub fn required_attendees(&self, dao_id: AccountId, amount: U128, eligible_count: u8) -> u8 {
        let config = self.tier_config(&dao_id);
        let spent = self.window_spent(&dao_id, &config);
        config.required(spent.saturating_add(amount.0), eligible_count as usize)
    }

    pub fn get_tiers(&self, dao_id: AccountId) -> TiersView {
        let config = self.tier_config(&dao_id);
        TiersView {
            tiers: config.tiers.iter().map(|&(up_to, required)| TierInput { up_to: U128(up_to), required }).collect(),
            window_secs: (config.window_ns / NS_PER_SEC) as u32,
            version: config.version,
            custom: self.tiers.contains_key(&dao_id),
            window_id: U64(config.window_id(now())),
            window_spent: U128(self.window_spent(&dao_id, &config)),
        }
    }

    pub fn get_participation(&self, dao_id: AccountId, account_id: AccountId) -> ParticipationView {
        let record = self.participation.get(&(dao_id, account_id)).cloned().unwrap_or_default();
        ParticipationView { ceremonies: record.ceremonies, last_at: U64(record.last_at), last_proposal_id: record.last_proposal_id }
    }

    /// Debug aid: the exact bytes an attendee must have signed. Clients compute
    /// these themselves; never trust this view as the source of what to sign.
    pub fn attestation_message(&self, dao_id: AccountId, proposal_id: u64, attendee: AccountId) -> Option<Base64VecU8> {
        self.sessions.get(&(dao_id.clone(), proposal_id)).map(|session| {
            Base64VecU8(protocol::attestation_message(
                env::current_account_id().as_str(),
                dao_id.as_str(),
                proposal_id,
                session.session_id,
                session.receiver_id.as_str(),
                session.amount,
                attendee.as_str(),
            ))
        })
    }

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            factory_suffix: self.factory_suffix.clone(),
            min_ttl_secs: (self.min_ttl_ns / NS_PER_SEC) as u32,
            max_ttl_secs: (self.max_ttl_ns / NS_PER_SEC) as u32,
            session_deposit: U128(self.session_deposit.as_yoctonear()),
            next_session_id: U64(self.next_session_id),
        }
    }

    pub fn version(&self) -> String {
        format!("accoryn-ceremony-gate/{}", env!("CARGO_PKG_VERSION"))
    }
}

impl CeremonyGate {
    /// DAO accounts are exactly `<label>.<factory_suffix>`; only the factory can
    /// create such accounts and it deploys only Sputnik DAO code there.
    fn is_dao(&self, account: &AccountId) -> bool {
        account
            .as_str()
            .strip_suffix(&format!(".{}", self.factory_suffix))
            .is_some_and(|label| !label.is_empty() && !label.contains('.'))
    }

    fn is_live(session: &Session) -> bool {
        let current = now();
        match session.status {
            Status::Open => current < session.expires_at,
            Status::Executing { since, .. } => current < since + STALE_EXECUTING_NS || current < session.expires_at,
            _ => false,
        }
    }

    fn tier_config(&self, dao_id: &AccountId) -> TierConfig {
        self.tiers.get(dao_id).cloned().unwrap_or_else(TierConfig::default_config)
    }

    fn window_spent(&self, dao_id: &AccountId, config: &TierConfig) -> u128 {
        match self.windows.get(dao_id) {
            Some(window) if window.window_id == config.window_id(now()) => window.spent,
            _ => 0,
        }
    }

    fn required_now(&self, dao_id: &AccountId, session: &Session) -> u8 {
        let config = self.tier_config(dao_id);
        config.required(self.window_spent(dao_id, &config).saturating_add(session.amount), session.eligible.len())
    }

    fn store_session(
        &mut self,
        dao_id: &AccountId,
        proposal_id: u64,
        host: &AccountId,
        session_pk: PublicKey,
        ttl_ns: u64,
    ) -> Result<SessionView, &'static str> {
        let proposal_raw = env::promise_result_checked(0, MAX_VIEW_BYTES).map_err(|_| "ERR_VIEW_FAILED")?;
        let policy_raw = env::promise_result_checked(1, MAX_VIEW_BYTES).map_err(|_| "ERR_VIEW_FAILED")?;
        let gate = env::current_account_id();
        let proposal = sputnik::parse_transfer_proposal(&proposal_raw, &gate)?;
        let policy = sputnik::parse_policy(&policy_raw, &gate, host)?;
        let current = now();
        let expires_at = current.checked_add(ttl_ns).ok_or("ERR_TTL")?;
        let proposal_expiry = proposal.submission_time.saturating_add(policy.proposal_period);
        if proposal_expiry < expires_at {
            return Err("ERR_PROPOSAL_EXPIRES_SOON");
        }
        let key = (dao_id.clone(), proposal_id);
        if let Some(existing) = self.sessions.get(&key) {
            if matches!(existing.status, Status::Voted { .. }) {
                return Err("ERR_ALREADY_VOTED");
            }
            if Self::is_live(existing) {
                return Err("ERR_SESSION_ACTIVE");
            }
        }
        let session = Session {
            session_id: self.next_session_id,
            host: host.clone(),
            session_pk,
            receiver_id: proposal.receiver_id,
            amount: proposal.amount,
            kind_json: serde_json::to_string(&proposal.kind).map_err(|_| "ERR_BAD_JSON")?,
            eligible: policy.eligible,
            attestations: Vec::new(),
            opened_at: current,
            expires_at,
            status: Status::Open,
            last_error: None,
            evidence_txs: Vec::new(),
        };
        self.next_session_id += 1;
        let view = self.view(dao_id, proposal_id, &session);
        emit(
            "session_opened",
            json!({"dao_id": dao_id, "proposal_id": proposal_id, "session_id": view.session_id, "host": host,
                   "required": view.required, "eligible_count": session.eligible.len(), "expires_at": view.expires_at}),
        );
        self.sessions.insert(key, session);
        Ok(view)
    }

    fn view(&self, dao_id: &AccountId, proposal_id: u64, session: &Session) -> SessionView {
        let status = match session.status {
            Status::Open if now() >= session.expires_at => "Expired",
            Status::Open => "Open",
            Status::Executing { .. } => "Executing",
            Status::Voted { .. } => "Voted",
            Status::Cancelled => "Cancelled",
        };
        SessionView {
            session_id: U64(session.session_id),
            dao_id: dao_id.clone(),
            proposal_id,
            host: session.host.clone(),
            session_pk: session.session_pk.clone(),
            receiver_id: session.receiver_id.clone(),
            amount: U128(session.amount),
            eligible: session.eligible.clone(),
            attestations: session
                .attestations
                .iter()
                .map(|(account_id, at)| AttestationView { account_id: account_id.clone(), at: U64(*at) })
                .collect(),
            required: self.required_now(dao_id, session),
            opened_at: U64(session.opened_at),
            expires_at: U64(session.expires_at),
            status: status.into(),
            last_error: session.last_error.clone(),
            evidence_txs: session.evidence_txs.iter().map(|hash| Base58CryptoHash::from(*hash)).collect(),
        }
    }
}

#[cfg(test)]
mod tests;
