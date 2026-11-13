//! Strict parsing of the Sputnik DAO v2 view results the gate depends on.
//!
//! The gate reads `get_proposal` and `get_policy` from the DAO in the same
//! cross-contract batch and refuses to open a session unless the proposal is an
//! in-progress native NEAR transfer and the policy lets nobody but this gate
//! approve transfers.

use near_sdk::serde_json::Value;
use near_sdk::AccountId;

use crate::tiers::{MAX_MEMBERS, MIN_MEMBERS};

/// Permissions that let a role approve a transfer proposal.
const APPROVE_TRANSFER: [&str; 4] = ["transfer:VoteApprove", "transfer:*", "*:VoteApprove", "*:*"];
pub const ELIGIBLE_ROLE: &str = "Requestor";

#[derive(Debug, Clone, PartialEq)]
pub struct TransferProposal {
    pub receiver_id: AccountId,
    pub amount: u128,
    /// The proposal kind exactly as the DAO returned it, passed back verbatim
    /// to `act_proposal` so the DAO itself rejects any mismatch.
    pub kind: Value,
    pub submission_time: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PolicyFacts {
    pub eligible: Vec<AccountId>,
    pub proposal_period: u64,
}

fn u64_field(value: &Value) -> Option<u64> {
    match value {
        Value::String(text) => text.parse().ok(),
        Value::Number(number) => number.as_u64(),
        _ => None,
    }
}

pub fn parse_transfer_proposal(raw: &[u8], gate: &AccountId) -> Result<TransferProposal, &'static str> {
    let proposal: Value = near_sdk::serde_json::from_slice(raw).map_err(|_| "ERR_BAD_JSON")?;
    if proposal.get("status").and_then(Value::as_str) != Some("InProgress") {
        return Err("ERR_PROPOSAL_NOT_IN_PROGRESS");
    }
    let kind = proposal.get("kind").ok_or("ERR_BAD_JSON")?;
    let transfer = kind.get("Transfer").ok_or("ERR_NOT_TRANSFER")?;
    if transfer.get("token_id").and_then(Value::as_str) != Some("") {
        return Err("ERR_NOT_NATIVE");
    }
    match transfer.get("msg") {
        None | Some(Value::Null) => {}
        Some(_) => return Err("ERR_NOT_NATIVE"),
    }
    let receiver_id: AccountId = transfer
        .get("receiver_id")
        .and_then(Value::as_str)
        .and_then(|text| text.parse().ok())
        .ok_or("ERR_BAD_JSON")?;
    if &receiver_id == gate {
        return Err("ERR_BAD_RECEIVER");
    }
    let amount: u128 = transfer
        .get("amount")
        .and_then(Value::as_str)
        .and_then(|text| text.parse().ok())
        .ok_or("ERR_BAD_JSON")?;
    if amount == 0 {
        return Err("ERR_BAD_JSON");
    }
    if let Some(votes) = proposal.get("votes") {
        let votes = votes.as_object().ok_or("ERR_BAD_JSON")?;
        if votes.values().any(|vote| vote.as_str() == Some("Approve")) {
            return Err("ERR_PRIOR_APPROVALS");
        }
    }
    let submission_time = proposal.get("submission_time").and_then(u64_field).ok_or("ERR_BAD_JSON")?;
    Ok(TransferProposal { receiver_id, amount, kind: kind.clone(), submission_time })
}

fn group_members(role: &Value) -> Option<Vec<AccountId>> {
    role.get("kind")?
        .get("Group")?
        .as_array()?
        .iter()
        .map(|member| member.as_str().and_then(|text| text.parse().ok()))
        .collect()
}

pub fn parse_policy(raw: &[u8], gate: &AccountId, host: &AccountId) -> Result<PolicyFacts, &'static str> {
    let policy: Value = near_sdk::serde_json::from_slice(raw).map_err(|_| "ERR_BAD_JSON")?;
    let roles = policy.get("roles").and_then(Value::as_array).ok_or("ERR_BAD_JSON")?;
    let mut gate_roles = 0usize;
    let mut eligible: Option<Vec<AccountId>> = None;
    for role in roles {
        let permissions = role.get("permissions").and_then(Value::as_array).ok_or("ERR_BAD_JSON")?;
        let can_approve_transfer = permissions
            .iter()
            .any(|permission| permission.as_str().is_some_and(|text| APPROVE_TRANSFER.contains(&text)));
        if can_approve_transfer {
            // Only a role whose sole member is this gate may approve transfers.
            // "Everyone" and token-weighted "Member" kinds are not groups and fail here.
            match group_members(role) {
                Some(members) if members.len() == 1 && &members[0] == gate => gate_roles += 1,
                _ => return Err("ERR_POLICY_NOT_GATED"),
            }
        }
        if role.get("name").and_then(Value::as_str) == Some(ELIGIBLE_ROLE) {
            if eligible.is_some() {
                return Err("ERR_BAD_JSON");
            }
            eligible = Some(group_members(role).ok_or("ERR_NOT_MEMBER")?);
        }
    }
    if gate_roles == 0 {
        return Err("ERR_POLICY_NOT_GATED");
    }
    let eligible = eligible.ok_or("ERR_NOT_MEMBER")?;
    let mut unique = eligible.clone();
    unique.sort();
    unique.dedup();
    if unique.len() != eligible.len() || eligible.len() < MIN_MEMBERS || eligible.len() > MAX_MEMBERS {
        return Err("ERR_MEMBER_COUNT");
    }
    if eligible.contains(gate) {
        return Err("ERR_POLICY_NOT_GATED");
    }
    if !eligible.contains(host) {
        return Err("ERR_NOT_MEMBER");
    }
    let proposal_period = policy.get("proposal_period").and_then(u64_field).ok_or("ERR_BAD_JSON")?;
    Ok(PolicyFacts { eligible, proposal_period })
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::serde_json::{self, json};

    type Mutation = Box<dyn Fn(&mut Value)>;

    const POLICY_FIXTURE: &str = include_str!("../../../web/tests/fixtures/sputnik/get_policy.accoryn-spike.json");
    const PROPOSAL_FIXTURE: &str = include_str!("../../../web/tests/fixtures/sputnik/get_proposal-0.accoryn-spike.json");

    fn gate() -> AccountId {
        "ceremony-gate-v1.accoryn.testnet".parse().unwrap()
    }
    fn alice() -> AccountId {
        "accoryn-alice.testnet".parse().unwrap()
    }
    fn fixture(text: &str) -> Value {
        serde_json::from_str::<Value>(text).unwrap()["result"].clone()
    }
    fn bytes(value: &Value) -> Vec<u8> {
        serde_json::to_vec(value).unwrap()
    }

    #[test]
    fn accepts_the_recorded_testnet_proposal() {
        let parsed = parse_transfer_proposal(&bytes(&fixture(PROPOSAL_FIXTURE)), &gate()).unwrap();
        assert_eq!(parsed.receiver_id.as_str(), "accoryn-payee.testnet");
        assert_eq!(parsed.amount, 100_000_000_000_000_000_000_000);
        assert_eq!(parsed.submission_time, 1_794_574_837_689_312_111);
        assert_eq!(parsed.kind["Transfer"]["msg"], Value::Null);
    }

    #[test]
    fn rejects_proposals_the_gate_must_not_approve() {
        let base = fixture(PROPOSAL_FIXTURE);
        let cases: Vec<(&str, Mutation)> = vec![
            ("ERR_PROPOSAL_NOT_IN_PROGRESS", Box::new(|p| p["status"] = json!("Approved"))),
            ("ERR_NOT_TRANSFER", Box::new(|p| p["kind"] = json!({"FunctionCall": {"receiver_id": "x.testnet", "actions": []}}))),
            ("ERR_NOT_NATIVE", Box::new(|p| p["kind"]["Transfer"]["token_id"] = json!("usdc.fakes.testnet"))),
            ("ERR_NOT_NATIVE", Box::new(|p| p["kind"]["Transfer"]["msg"] = json!("ft_transfer_call"))),
            ("ERR_BAD_RECEIVER", Box::new(|p| p["kind"]["Transfer"]["receiver_id"] = json!("ceremony-gate-v1.accoryn.testnet"))),
            ("ERR_BAD_JSON", Box::new(|p| p["kind"]["Transfer"]["amount"] = json!("0"))),
            ("ERR_BAD_JSON", Box::new(|p| p["kind"]["Transfer"]["amount"] = json!("-1"))),
            ("ERR_PRIOR_APPROVALS", Box::new(|p| p["votes"] = json!({"accoryn-bob.testnet": "Approve"}))),
        ];
        for (expected, mutate) in cases {
            let mut proposal = base.clone();
            mutate(&mut proposal);
            assert_eq!(parse_transfer_proposal(&bytes(&proposal), &gate()), Err(expected));
        }
        assert_eq!(parse_transfer_proposal(b"not json", &gate()), Err("ERR_BAD_JSON"));
    }

    #[test]
    fn accepts_the_recorded_gated_policy() {
        let facts = parse_policy(&bytes(&fixture(POLICY_FIXTURE)), &gate(), &alice()).unwrap();
        assert_eq!(facts.eligible.len(), 3);
        assert_eq!(facts.proposal_period, 259_200_000_000_000);
    }

    #[test]
    fn rejects_policies_that_let_anyone_else_approve_transfers() {
        let base = fixture(POLICY_FIXTURE);
        let role_index = |policy: &Value, name: &str| {
            policy["roles"].as_array().unwrap().iter().position(|r| r["name"] == name).unwrap()
        };
        let cases: Vec<(&str, Mutation)> = vec![
            ("ERR_POLICY_NOT_GATED", Box::new(move |p| {
                let i = role_index(p, "Requestor");
                p["roles"][i]["permissions"].as_array_mut().unwrap().push(json!("transfer:VoteApprove"));
            })),
            ("ERR_POLICY_NOT_GATED", Box::new(move |p| {
                let i = role_index(p, "Admin");
                p["roles"][i]["permissions"].as_array_mut().unwrap().push(json!("*:*"));
            })),
            ("ERR_POLICY_NOT_GATED", Box::new(move |p| {
                p["roles"].as_array_mut().unwrap().push(json!({"name": "all", "kind": "Everyone", "permissions": ["*:VoteApprove"], "vote_policy": {}}));
            })),
            ("ERR_POLICY_NOT_GATED", Box::new(move |p| {
                let i = role_index(p, "Approver");
                p["roles"][i]["kind"]["Group"].as_array_mut().unwrap().push(json!("accoryn-bob.testnet"));
            })),
            ("ERR_POLICY_NOT_GATED", Box::new(move |p| {
                let i = role_index(p, "Approver");
                p["roles"].as_array_mut().unwrap().remove(i);
            })),
            ("ERR_MEMBER_COUNT", Box::new(move |p| {
                let i = role_index(p, "Requestor");
                p["roles"][i]["kind"]["Group"] = json!(["accoryn-alice.testnet"]);
            })),
            ("ERR_NOT_MEMBER", Box::new(move |p| {
                let i = role_index(p, "Requestor");
                p["roles"][i]["kind"]["Group"] = json!(["accoryn-bob.testnet", "accoryn-carol.testnet"]);
            })),
        ];
        for (expected, mutate) in cases {
            let mut policy = base.clone();
            mutate(&mut policy);
            assert_eq!(parse_policy(&bytes(&policy), &gate(), &alice()), Err(expected));
        }
    }
}
