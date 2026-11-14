# Context 2: engines, security architecture and NEAR authority

**Updated:** 2026-11-13 (second update, after the first engine delivery).

**Lane:** engine/security. Its companion lane is [Context 1](CONTEXT_1.md), the app delivery lane, which built the current app. Read AGENTS.md and both context files before starting.

This lane is the engine/authority half of the same product, not a separate app.

- **Start with:** [docs/integration/context-two-engines.md](docs/integration/context-two-engines.md) for the API and how the app should call it.
- **Then:** [docs/testing/context-two-local.md](docs/testing/context-two-local.md) to reproduce every result on your own machine.


## Local main integration checkpoint

The user requested bringing the connected treasury UI and adapter into `main` from `feat/end-to-end-integration` through `e46ce1a`. Use `/treasury/` for browser account → vault → invoice → acoustic member approval → verified payout, and `/board/?dao=…` for public reads. Start with `VITE_ENABLE_TESTNET_WRITES=1` to enable testnet signing. The legacy `/workspace/` keeps its disabled v1 service boundary. No new contract deployment or gate-key deletion is part of this merge. Physical-device and extended live governance acceptance remain open; see [the manual guide](docs/testing/end-to-end-integration.md).

## Submission readiness update — 2026-11-14

Branch `feat/submission-readiness` (PR to `main`). Contract code unchanged.

- [x] Public board shows gate enforcement, gate key status, factory auto-update, every amount tier (including "all members" above the top tier), each member's participation record and who attested per payment. Rejected proposals export as `rejected`, not `failed`.
- [x] App named **Accoryn** everywhere; MIT `LICENSE` added; README rewritten for judges (try-it steps, what we add to Sputnik/Trezu, tracks, arguments against, Proof-of-vicinity baseline).
- [x] Hosted static build with testnet writes: **https://accoryn.vercel.app** (Vercel, account ayush-ranjan-official). The demo-user picker exists only on the dev server; type account IDs on the hosted site.
- [x] Fresh scripted payout on `accoryn-demo` (proposal 1) and `FactoryInfoUpdate{auto_update:false}` passed there (proposal 2). Transactions: [deployment record](docs/deployment/testnet.md).
- [ ] Two-device rehearsal and demo recording on the hosted site (humans).
- [ ] Gate key deletion after the recording, on explicit confirmation.

## Hackathon facts

- **Event:** NEAR HACKATHON. Development and submission end **2026-11-14T23:59Z**. The live rules are at https://nearhackathon.com/HACKATHON.md; reread them before submitting.
- **Requirements:**
  - a public repository
  - a LICENSE
  - a README that AI screeners can follow ("do X → see Y")
  - the human's X post with a demo video
  - **one** confirmed submission
- **Tracks:**
  - `social` (lead)
  - `open`
  - `realworld` (once the invoice → settled receipt flow works in the app)
  - `privacy`/`security` only if the optional AI-proposer stretch ships
- **Social Money brief:** "Don't rebuild the multisig — build what communities do with it." Sputnik/Trezu hold custody; we add amount tiers, a meeting requirement, a per-member participation record and a public board.

## Decisions approved by the Context 2 owner on 2026-11-13 (do not reopen)

1. **Custody: object-only, app-made accounts.**
   - The browser generates an ed25519 full-access key for a new `<name>.testnet` account, created through the testnet helper, and stores it in IndexedDB.
   - The object scan is a disclosed local convenience unlock. It is not a key, encryption or a secret.
   - Recovery means DAO governance replaces a lost member.
2. **Enforcement: the on-chain ceremony gate is the DAO's only transfer approver.**
   - Members attest with their own accounts using the challenge-derived session key: signed attestations, not commit-reveal.
   - Fallback rule: if the gate had not worked on testnet by 2026-11-14 03:00Z, we would use native votes with the ceremony as evidence. It worked, so the fallback is not needed.
3. **Approved security trade-offs (all disclosed):**
   - G = max(2, N−1) members can change the policy or the gate. This is the governance escape hatch and the recovery path.
   - The factory `auto_update` risk remains until `FactoryInfoUpdate{auto_update:false}` passes.
   - The gate is locked (keys deleted) before submission.
   - There is no silent fallback when sound fails.
   - Approval covers testnet only.
4. **Scope:**
   - amount tiers and a participation record
   - a public board
   - verified invoice receipts
   - a Trezu-compatible role layout (Requestor/Admin/Approver)
   - an AI proposer only as a stretch
5. **The Context 2 lane may edit UI and routes** to meet the deadline, through reviewed PRs, coordinating with Context 1. Context 1 still owns its existing screens' behavior and tests.
6. **Acoustic modem:** port the proven modem from the owner's earlier Proof-of-vicinity prototype (ggwave 0.4.0) instead of writing a new one.

## Non-negotiable boundaries (unchanged)

These hold throughout:
- Use built-in device hardware only: no NFC, tags, external keys or GPS, and no mandatory passkey.
- An ordinary photographed object is not a high-entropy secret.
- A browser cannot assert that a capture is fresh.
- Sound can be relayed, and several devices need not mean several people.
- Hearing a challenge is not consent to pay.
- Do not manufacture thresholds or proofs; show the evidence.

## Status

`[x]` means implemented and verified as described. It is not a claim of production security or universal device compatibility.

### D. NEAR authority, treasury policy and settlement

- [x] Assessed the real Sputnik deployment.
  - The factory is `sputnikv2.testnet`, not `sputnik-v2.testnet`, and DAO code is v2.3.1 (`AA4nA45v…`).
  - Trezu is mainnet-only, so we copy its role layout instead of integrating it on testnet.
- [x] Explicit policy (`web/src/engines/near/policy.ts`):

  | Role | Members | Can do | Votes needed |
  |---|---|---|---|
  | Requestor | all members | propose, reject, finalize transfers | majority to reject |
  | Admin | all members | governance | G, quorum 2 |
  | Approver | the gate only | approve transfers | 1 |

  The builder output equals what testnet stores. The conformance check rejects every known bypass, including roles that need zero votes, which would otherwise allow a Finalize-based bypass.
- [x] Enforcement: humans cannot approve transfers (`ERR_PERMISSION_DENIED`, verified on testnet). The gate refuses ungated policies.
- [x] Ceremony gate contract `contracts/ceremony-gate`, deployed at `ceremony-gate-v1.accoryn.testnet`.
  - It covers sessions, signed attestations, cumulative amount tiers with a spend window, participation records, settlement-evidence pointers, and `set_tiers` callable only by the DAO.
  - Tests: 16 unit + 5 sandbox tests against the exact testnet Sputnik code.
- [x] Real treasury operations on testnet: create (`web/scripts/create-gated-dao-testnet.ts`), propose, ceremony, execute.
  - Three passing live ceremonies, recorded in [docs/deployment/testnet.md](docs/deployment/testnet.md).
  - Sandbox coverage: underfunded payouts revert, a `Failed` payout can be finalized exactly once, and a mid-ceremony reject reopens the session.
- [x] Settlement truth: `verifySettlement` requires exactly one successful DAO → recipient transfer of the exact amount, plus an `Approved` proposal. It is tested on a recorded real transaction.
- [x] Idempotent writes: `TxJournal` stores the signed transaction before broadcasting and reconciles without re-signing. Live: no duplicate on resubmit, and verified `expired` when the nonce was consumed.
- [ ] **Lock the gate:** delete its last full-access key before submission and record it in the deployment doc.
- [ ] Run the `FactoryInfoUpdate{auto_update:false}` hardening proposal when a treasury is created in the app.
- [ ] Invoice → proposal → receipt linkage in the app. The description tag codec and the receipt mapping exist; the UI wiring is pending.
- [ ] Optional: gas sponsorship, escrow, Intents/Chain Signatures. Not core; Intents has no testnet.

### B. Object-only access, custody and recovery

- [x] Custody design decided (above) and the threat model written: [docs/security/ceremony-threat-model.md](docs/security/ceremony-threat-model.md).
- [x] Browser keystore for app-made accounts, and account creation through the testnet helper with a sub-account fallback (`web/src/engines/near/{keystore,account}.ts`).
- [ ] Object unlock wired to `Keystore.signerFor`, with a provisional *research* threshold from a small consented evaluation (accept/retry/reject with denominators). Until then it reports scores only.
- [ ] Recovery UI: create a new account, then a governance proposal swaps the member. Can be shown with a script first.

### C. Acoustic engine and session verifier

- [x] ggwave modem and session helpers (`web/src/engines/acoustic/`).
  - Typed outcomes: decoded, timeout, no-signal, cancelled, unsupported, denied.
  - Idempotent dispose and a watchdog for stalled playback.
- [x] Session record bound to network, DAO, proposal, recipient, amount, attendee, nonce and expiry: the protocol v1 vectors in `contracts/ceremony-gate/tests/vectors.json`.
- [x] Verifier semantics, tested in the gate:
  - replay, a changed amount or proposal, the wrong signer, duplicates and expiry are all rejected
  - a live relay is **not** prevented, and this is disclosed
- [x] Evidence so far:
  - **Software:** real ggwave round trips.
  - **Same-laptop physical loopback through `/acoustic-check/`:** 26 of 27 decoded. audible-fast takes about 2 s per 20-character frame, and audible-fastest about 1.3 s.
- [ ] **Two-device physical test** (laptop ↔ phone, quiet and noisy): [docs/testing/acoustic-check-manual.md](docs/testing/acoustic-check-manual.md) Part B. A human must run it.

### A. Vision engine research (deprioritized for the deadline)

- [ ] A small consented capture evaluation for the provisional unlock threshold, as above. DINOv3, LightGlue and WebGPU are out of scope before submission.

### E. Evidence and hardening

- [x] Contract, engine and live-testnet tests with honest labels: recorded fixtures carry provenance, and software-only audio is labelled.
- [x] A clean-clone reproduction passed (`npm ci` + full web check, contract fetch + tests + clippy). The deployed gate code hash equals the clean-clone build on our toolchain; it is not Docker-reproducible.
- [x] Testnet deployment record and threat model.
- [ ] Final security/limitations section in the README for judges.

## Next steps, in order

1. **Wire the engines into the app** (shared with Context 1 and coordinated on `WorkspacePage.tsx`):
   - Build `web/src/engines/services.ts`, which implements `AppServices`, and apply the proposed interface v2 changes in [the engines guide](docs/integration/context-two-engines.md).
   - Bind it in `web/src/integration/bindings.ts` behind configuration, and update `tests/integration-boundary.test.ts`.
   - UI changes: an account name plus the object unlock, the treasury view with tiers and enforcement, Host/Join ceremony controls, and receipts.
2. **Public read-only board `/board/?dao=`:** policy, tiers, proposals, sessions, attendance and payouts with explorer links. No keys needed, so judges can use it.
3. **Two-device manual test (M2):** three devices create accounts, then create and fund a treasury, propose from an invoice, run the ceremony, execute, and check the receipt and CSV. Also test reload and reconcile.
4. **Lock the gate, rewrite the README for judges and add a LICENSE.** The human handles the demo video, publishes the repository, posts on X and submits.

## Ownership and Git

- **Context 2 owns:** `contracts/`, `web/src/engines/`, the engine scripts in `web/scripts/` and the engine/security docs.
- **Context 1 owns:** the existing screens, the object-registration controller and the workspace journal. Interface changes are reviewed across lanes.
- **Git:** use feature branches and reviewed PRs, with no force-pushes and no unreviewed merges into `main`.
- **Never commit:**
  - keys (testnet keys live in `~/.near-credentials`)
  - captures
  - generated reports
  - the fetched `tests/res/*.wasm`

## Integration handoff update — 2026-11-13

Context 1 integrated the delivered engines on local branch `feat/end-to-end-integration` in `engines/app/`, `/treasury/` and `/board/`. A complete real testnet payout with actual laptop audio passed; see [acceptance/evidence](docs/testing/end-to-end-integration.md). The new adapter keeps gate tiers and host/listener roles explicit instead of coercing them into the old v1 fixed-threshold workspace stubs.

- [x] Account/treasury/acoustic/invoice/settlement/CSV wiring and read-only board implemented.
- [x] Atomic membership replacement and factory-hardening governance controls implemented.
- [ ] Additional live governance votes: the fresh-account test was stopped by helper HTTP 429, before votes.
- [ ] Recognition calibration, spoof resistance, secure custody and two-device manual acceptance remain unproven/pending. The shipped handoff is manually acknowledged research continuation, not automated object authentication.
- [ ] Gate developer-key deletion still needs its own authorization; untouched here.

Coordinate source edits with this integration branch before further engine/UI changes. No public push or main merge is included in this handoff.
