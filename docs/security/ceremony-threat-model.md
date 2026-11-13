# Ceremony gate: protocol, guarantees and limits

Status: v1 on NEAR testnet (`ceremony-gate-v1.accoryn.testnet`). This is a self-review, not a security audit.

## What the product claims

A team's Sputnik DAO pays a transfer only after enough team members, each using their own NEAR account, attest that they received a fresh challenge broadcast by sound during a meeting. The number of members required grows with the cumulative amount paid in the current spend window.

It does **not** claim:
- physical proximity, because sound can be relayed live over a call;
- distinct humans, because one person can control several member accounts or devices;
- that a member's device is uncompromised;
- that the camera object check is a secret. The object scan is a local convenience unlock and is not cryptography.

## Accounts and custody (decided 2026-11-13)

- **Keys.** Each member uses an app-made testnet account. The browser generates an ed25519 full-access key and stores it in IndexedDB as extractable material.
- **What the object scan does.** It only gates use of that key in the app. Anyone with access to the browser profile can bypass it.
- **What actually protects the money.** The on-chain DAO policy and the gate. A single stolen member key can attest only as that one member.
- **Recovery.** A lost member is replaced through DAO governance (G of N members), not through the object.

## Protocol v1

Bytes are pinned by `contracts/ceremony-gate/tests/vectors.json`. The same vectors are checked by the TypeScript code and by an independent Rust ed25519 implementation.

```
challenge  = 15 random bytes (host device)                       // 120 bits
frame      = base64url(challenge)                                // 20 characters over ggwave
seed       = sha256("accoryn-ceremony-seed-v1" 0 gate 0 dao 0 proposal_id 0 challenge)
session_pk = Ed25519.publicKey(seed)                             // only this goes on-chain (open_session)
message    = "accoryn-ceremony-attest-v1" 0 gate 0 dao 0 proposal_id 0 session_id 0 receiver 0 amount 0 attendee
attest tx  = signed by the attendee's own account, carrying Ed25519.sign(message, seed)
```

1. **Host.** The host calls `open_session(dao, proposal, session_pk, ttl ≤ 600 s)` with a 0.1 NEAR deposit, which prepays storage and is refunded if the gate refuses. The gate then reads `get_proposal` and `get_policy` from the DAO in one cross-contract batch. It stores the session only if the proposal is an in-progress native NEAR transfer with no earlier approvals and the policy is gated (see below).
2. **Listener.** The listener decodes the frame, derives `session_pk` and compares it with `get_session`, which rejects corrupted, stale or foreign audio before anything is signed. It then shows the exact recipient and amount. The member's explicit approval sends `attest`. Hearing the sound alone signs nothing.
3. **Execute.** Any eligible member calls `execute`. The gate checks the attestation count against `tier(window_spent + amount)` and takes an optimistic lock. It calls the DAO's `act_proposal(VoteApprove)` with the stored proposal kind, so the DAO itself rejects any mismatch, and the DAO pays inside that vote.
4. **Settlement.** Settlement truth is read from chain data: the final transaction outcome must contain exactly one successful DAO → recipient `Transfer` receipt of the exact amount, and the proposal must be `Approved` (`web/src/engines/near/settlement.ts`). `record_evidence` stores only a pointer that anyone can re-verify.

The challenge never appears on-chain. Copying another member's attestation is useless, because each one is bound to the attendee's account and the transaction is signed by that account.

## Threats and results

| Threat | Result |
|---|---|
| A human approves a transfer directly | `ERR_PERMISSION_DENIED` from Sputnik; only the gate holds `transfer:VoteApprove` (verified on testnet) |
| Replay of an old session's audio | Different session key: the client sees the mismatch and the gate rejects the signature |
| Audio meant for another proposal or DAO | The key is domain-separated by gate, DAO and proposal |
| Copying a member's attestation | Bound to that member, so `ERR_BAD_SIGNATURE` for anyone else |
| Non-member or duplicate attestation | `ERR_NOT_ELIGIBLE` / `ERR_ALREADY_ATTESTED` |
| Guessing the seed from `session_pk` | 2^120 work inside a TTL of at most 10 minutes |
| Splitting a large payment into small ones | Tiers use cumulative spend per fixed window. Default: up to 1 NEAR needs 2 attendees, up to 10 NEAR needs 3, above that every member. |
| Proposal rejected or changed between attest and execute | The DAO refuses the vote, and the gate reopens the session (`ERR_VOTE_FAILED`) and rolls back the spend window |
| Underfunded treasury | The DAO receipt fails with `LackBalanceForState`, nothing is paid, and the same session can execute after funding |
| Transfer receipt fails after a successful vote | The proposal becomes `Failed`. A requestor can `Finalize` it once, and a second `Finalize` fails (paid once) |
| A policy role with zero required approvals (a `Finalize` path around the gate) | The gate refuses ceremonies (`ERR_POLICY_NOT_GATED`), as does the client conformance check |
| A fake "DAO" contract | `dao_id` must be `<label>.sputnikv2.testnet`, and only the factory can create such accounts |
| Live relay of the challenge to an absent colluder | **Not prevented.** Mitigated only by the short TTL and visible attestation timestamps |
| One person with several member accounts | **Not prevented.** Membership is a governance responsibility |

Tests that cover these rows: `contracts/ceremony-gate/src/tests.rs`, `contracts/ceremony-gate/src/sputnik.rs` and `contracts/ceremony-gate/tests/sandbox.rs`. The sandbox tests run the exact testnet Sputnik v2.3.1 code.

## DAO policy and intentional powers

Policy roles, with N members and G = max(2, N−1):

| Role | Members | Can do |
|---|---|---|
| Requestor | all members | propose, reject (by majority) and finalize transfers |
| Admin | all members | governance: config, policy, membership, `call`, factory info, with G votes and quorum 2 |
| Approver | the gate only | approve transfers |

Bounties, upgrades, vote tokens, `RemoveProposal`, `VoteRemove`, wildcards and Everyone/Member roles are never granted.

Remaining powers, disclosed:
1. **G members can move funds without the ceremony** by changing the policy, removing the gate, or approving a `FunctionCall` with a deposit. This is also how a lost member is replaced. It is visible on-chain, but there is no timelock.
2. **The `sputnikv2.testnet` factory owner can replace DAO code** while the DAO's `auto_update` factory setting is true. A `FactoryInfoUpdate{auto_update:false}` governance proposal removes this; the app should run it first.
3. **Gate upgrades.** The gate currently still has a developer full-access key, so its developers can upgrade it. It will be locked before submission by deleting all its keys. After that, fixes mean deploying a new gate and switching each DAO to it through governance.
4. **Retries and session holds.** Any member can retry a failed, already-approved payment, and any member can hold an open session for up to its TTL.
5. **Public data.** The proposal purpose and invoice reference are public on-chain.
