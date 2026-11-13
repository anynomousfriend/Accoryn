# Context 2 engines: integration guide for the app lane

**Updated:** 2026-11-13.

**Audience:** the Context 1 contributor and their coding agent.

This guide records what the engine/security lane has delivered, what it guarantees, and how the app should call it. Context 1's original adapter contract is still the starting point ([context-one-adapter.md](context-one-adapter.md), `web/src/integration/services.ts`).

**Nothing below is wired into `bindings.ts` yet.** `getAppServices()` still returns no capabilities, so the workspace buttons stay disabled until the adapter described below is built and tested together.

## What exists and is verified

| Area | Code | Evidence |
|---|---|---|
| Ceremony gate contract (Rust) | `contracts/ceremony-gate/` | 16 unit tests + 5 sandbox tests against the exact testnet Sputnik v2.3.1 code. Deployed: [testnet record](../deployment/testnet.md) |
| Ceremony protocol v1 (TS) | `web/src/engines/ceremony/crypto.ts` | Shared vectors checked by TypeScript and by ed25519-dalek in Rust |
| Acoustic modem and session | `web/src/engines/acoustic/{modem,session}.ts` | Real ggwave round trips (software); same-laptop physical loopback 26/27; two-device test still manual |
| Gated Sputnik policy and conformance | `web/src/engines/near/policy.ts` | Builder output equals the policy testnet stored; rejects every known bypass variant |
| Sputnik parsing and app mapping | `web/src/engines/near/sputnik.ts` | Tested on recorded testnet responses; `toAppProposal` output passes `validateProposal` |
| Settlement verification | `web/src/engines/near/settlement.ts` | Tested on a recorded real payout transaction |
| Lab page | `/acoustic-check/` (`web/src/acoustic-check/`) | Real Chrome Web Audio tests plus the manual two-device checklist |
| Testnet scripts | `web/scripts/{create-gated-dao-testnet,smoke-ceremony-testnet}.ts` | Three passing live ceremonies on 2026-11-13, one of them on a DAO created by the script |
| Testnet RPC client | `web/src/engines/near/rpc.ts` | Ordered fallback endpoints and archival tx lookup. Typed `RpcUnavailableError` / `RpcRequestError`, tested on a local HTTP fixture |
| Browser keystore | `web/src/engines/near/keystore.ts` (+ `idb.ts`) | IndexedDB records validated on read. `list()` never contains secrets (browser test). Keys are extractable material: a disclosed limit |
| App-made accounts | `web/src/engines/near/account.ts` | Testnet helper creation (one live run: 10 NEAR, idempotent re-run); sub-account fallback through the journal |
| Transaction journal | `web/src/engines/near/txjournal.ts` | Signed bytes are stored before broadcast, under a per-signer Web Lock. Reconcile never re-signs. Live: no duplicate on resubmit, and verified `expired` when the nonce was consumed |

The journal's reconcile decision table and the near-api-js v7 quirks are in [near-engine-io.md](../testing/near-engine-io.md).

## Decisions the app must follow

These were approved by the Context 2 owner on 2026-11-13.

1. **Custody: object-only, app-made accounts.**
   - The browser creates `<name>.testnet` through the testnet helper with a full-access key stored in IndexedDB.
   - The object scan only unlocks that key locally. Never describe it as encryption, a password or a key.
2. **Enforcement: the gate is the DAO's only transfer approver.** Members can never approve a transfer directly. Approval means "attest during a ceremony", then any member runs `execute`.
3. **Consent: decoded sound is not consent.** The listener must show the exact recipient and amount, and the member's explicit approve action sends `attest`.
4. **No silent fallback.** If sound fails, show the failure. A typed-code fallback needs a separate product decision.
5. **UI ownership.** The Context 2 lane may also edit UI and routes, through reviewed PRs, to meet the deadline. Coordinate on `WorkspacePage.tsx`.

## How the ceremony maps to `AppServices`

| v1 method | Engine operation |
|---|---|
| `openAccount` | `validateNewAccountId`, then `Keystore.generate`, `createViaTestnetHelper`, and `Keystore.markActive` (the key is confirmed on chain). The object unlock gates `Keystore.signerFor` locally |
| `recoverAccount` | Same device: load the key after the object unlock. Lost device: create a new account, then a governance proposal (G members) swaps the member |
| every write | `TxJournal.submit({ requestId, ... })`; `reconcileAction` → `TxJournal.reconcile(requestId)` mapped to `pending`/`unknown`/`confirmed`/`rejected` (`expired` = verified non-execution) |
| `createTreasury` | `buildCreateDaoArgs({ name: deriveDaoName(team, requestId), members, gateId })`, then factory `create` with a 6 NEAR deposit and 150 Tgas. Confirm with `get_policy` and `checkPolicyConformance`. |
| `readTreasury` | DAO `get_policy`, `get_available_amount`; gate `get_tiers` |
| `proposePayment` | DAO `add_proposal`. Transfer `token_id: ""`, deposit 0 (bond is 0). Description from `encodeDescription(purpose, { req, draft, inv })` |
| `startAcousticSession` | **Host:** `generateChallenge`, `ceremonySeed`, `sessionPublicKey`, gate `open_session` (0.1 NEAR, 100 Tgas), then `broadcastChallenge`. **Listener:** `listenForChallenge` with an `accept` that checks the derived key equals `get_session(...).session_pk` |
| `approveProposal` | gate `attest(dao, id, base64(signAttestation(attestationMessage(...), seed)))` (30 Tgas) |
| `executeProposal` | gate `execute` (300 Tgas, wait FINAL), then `EXPERIMENTAL_tx_status`, `verifySettlement`, gate `record_evidence` |
| `readProposal` | DAO `get_proposal` + gate `get_session`, then `toAppProposal({ ... attestations, requiredAttendees, settlementVerified })` |
| `listReceipts` | DAO `get_proposals`; take `invoiceId` from `parseDescription`; `transactionIds` = verified evidence only |

**Status mapping** (`mapProposalStatus`):

| Sputnik status | App status |
|---|---|
| InProgress | `pending` |
| InProgress, past expiry | `rejected` |
| Approved, settlement verified | `settled` |
| Approved, not verified | `unknown` |
| Failed | `failed` |
| Rejected, Expired, Removed | `rejected` |
| Moved, or not a native transfer | declined (throws) |

**Interface v2 changes needed** (proposed; not yet applied to `services.ts`):
- `openAccount({ accountName })`.
- `Treasury` replaces `requiredApprovals` with `approvalTiers`, `tierWindowSecs`, `governanceApprovals`, `enforcement` (`ceremony-gate` with gate id and code hash, or `native-votes`, or `not-enforced` with reasons), and `spendableAtomic`.
- `createTreasury` no longer takes a threshold.
- `startAcousticSession(proposal, role: "host" | "listener", onProgress, signal)`.
- `AcousticEvidence` gains `sessionId`, `role` and `requiredAttendees`.

`Proposal.approvals` = attestations and `requiredApprovals` = required attendees, so `action-policy.ts` keeps working unchanged.

## Gate contract surface

**Methods:**
- `open_session(dao_id, proposal_id, session_pk, ttl_secs)` (payable)
- `attest(dao_id, proposal_id, signature)` returns the attestation count
- `execute(dao_id, proposal_id)`
- `cancel_session` (host only)
- `record_evidence(dao_id, proposal_id, tx_hash)`
- `set_tiers(tiers, window_secs)` (only the DAO itself, through a FunctionCall proposal)

**Views:** `get_session`, `required_attendees`, `get_tiers`, `get_participation`, `attestation_message`, `get_config`, `version`.

**Events:** NEP-297, standard `accoryn_ceremony` 1.0.0.

**Errors:**
- **Opening a session:** `ERR_DEPOSIT`, `ERR_TTL`, `ERR_NOT_SPUTNIK_DAO`, `ERR_BAD_PK`, `ERR_GAS`, `ERR_SESSION_ACTIVE`, `ERR_ALREADY_VOTED`.
  - Refusals inside the callback emit `session_rejected` with a reason and refund the deposit: `ERR_PROPOSAL_NOT_IN_PROGRESS`, `ERR_NOT_TRANSFER`, `ERR_NOT_NATIVE`, `ERR_PRIOR_APPROVALS`, `ERR_POLICY_NOT_GATED`, `ERR_NOT_MEMBER`, `ERR_MEMBER_COUNT`, `ERR_PROPOSAL_EXPIRES_SOON`.
- **Attest and execute:** `ERR_NO_SESSION`, `ERR_SESSION_CLOSED`, `ERR_SESSION_EXPIRED`, `ERR_NOT_ELIGIBLE`, `ERR_ALREADY_ATTESTED`, `ERR_BAD_SIGNATURE`, `ERR_SESSION_BUSY`, `ERR_NOT_ENOUGH_ATTENDEES`.
- **Vote failure:** `ERR_VOTE_FAILED` is stored as `last_error` when the DAO refuses the vote.

**Facts verified on Sputnik testnet v2.3.1** (do not assume otherwise):
- `create` returns an empty value; confirm the DAO exists instead.
- Permissions are stored as a set, so on-chain order differs.
- An underfunded payout reverts the gate's vote (`LackBalanceForState`); it does not mark the proposal `Failed`.
- The DAO logs our `act_proposal` memo (`accoryn-ceremony:v1:session=<id>:attendees=<n>`).

## Pitfalls already hit

- **npm 11 lockfile pruning.** `npm install <pkg>` in `web/` drops the `@emnapi/core` and `@emnapi/runtime` 2.0.0-beta.2 lock entries, which breaks a clean `npm ci`. After any dependency change:
  1. Restore those entries from `main`'s lockfile.
  2. Run `npm ci` in an empty copy to confirm it works.
- **Cold dev server reloads.** These dependencies are pre-bundled in `vite.config.ts`: transformers, ggwave, near-api-js, noble. Without that, the first run of a cold dev server reloaded pages mid-test.
- **iOS audio unlock.** Call the modem's `init()` inside the tap handler before any `await`, or iOS Safari will not unlock audio.
- **Unit test runner.** Unit tests run with `node --test` and type stripping. Use erasable TypeScript only, with `.ts` import extensions and `import type`.
