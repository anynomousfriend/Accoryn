# App adapter handoff — Context 1 / Context 2

Date: 2026-11-13. App-owned v1 integration proposal. No engine is connected and no custody, verifier or treasury-security architecture is approved by this document.

## File ownership

Context 1 owns `web/src/integration/services.ts`, `validation.ts` and `bindings.ts`, all workspace React code, root web dependencies/builds and browser integration tests. Context 2 owns `web/src/engines/`, `contracts/`, `services/` and its protocol/security tests. Implement an engine adapter in your own directory; Context 1 changes the single `getAppServices()` binding after interface review and real integration tests. Do not rewrite both sides or edit the root lockfile concurrently.

`services.ts` is the exact typed app-facing contract. `bindings.ts` currently returns version 1 with an empty capability list. Optional methods plus advertised capabilities must both be present before the app enables an action. This default is an explicit unavailable state, not a successful mock. No API backend, fake wallet or sound codec is implemented by this lane.

## Required semantics before connecting

- This version handles **testnet native NEAR only**. Amounts are atomic-unit decimal strings; draft entry supports 24 decimal places and exact integer line-item arithmetic. Token/cross-chain support requires a reviewed extension, not relabelling another asset as NEAR.
- Account/custody methods own authentication, object-verification challenges, signing and recovery. The existing local object comparison is not authentication. Client account IDs, templates, enabled buttons and success flags are never authority. No key material may be returned in view models.
- All mutating calls receive a stable `requestId`. Enforce server/contract idempotency by that identifier; proposal creation must also protect the stable draft/invoice intent against duplicate creation across reloads/tabs. Authenticate independently. A request ID is not authorization.
- Successful account/treasury results mean authoritative creation/access/membership, not a queued network request. Proposal `pending` means an actually created proposal awaiting decisions. An execute result still `pending`, or any `unknown` result, retains the client's reconciliation barrier.
- `reconcileAction` is read-only and takes the persisted request identity. It must return the same ID and an authoritative action outcome. `confirmed` means that action is confirmed, not automatically that its payment settled; the canonical proposal/receipt supplies payment state. The typed `ReconciliationResult` requires a matching action-kind outcome model for `confirmed`; runtime validation also requires the original payment terms and proposal identity. Return the canonical account/treasury/proposal as required by the action. An absent or unrelated model cannot clear the journal. Legacy records lacking payment context remain blocked rather than guessing. Never turn a timeout into `rejected` without verifying nonexecution.
- A proposal's network, asset, treasury, recipient, atomic amount, purpose and immutable content hash must correspond to the reviewed draft. Editing a draft invalidates review/session/consent. Submitted draft references persist and cannot silently rebind to another proposal; use an explicitly new draft for a new intent.
- Treasury models represent eligible unweighted member accounts and their required approval count. Weighted/role-dependent policies that cannot be faithfully represented must be declined or extend the interface before use. Never invent or truncate the displayed policy to fit v1.
- Acoustic results identify proposal/hash, declared participants and expiry. The returned view object is not cryptographic evidence by itself: trusted verifier/enforced-policy validation belongs to the engine. Backend authorization must reject missing participants, stale policy/session, changed proposals, replay and unauthorized signers. Sound is never consent or an unrelayable distance proof.
- `AbortSignal` stops local work; it does not prove an already submitted transaction was canceled. Mutations are journaled before invocation. Late UI results do not authorize resubmission. `releaseResources()` must synchronously/idempotently release owned audio/camera/worker resources without throwing; it must not silently cancel or resend financial actions.
- Reconciled receipts include network, treasury/proposal/invoice, recipient, asset/decimals, atomic amount, explicit status/timestamps and transaction evidence. Settled records require actual chain evidence. UI export preserves atomic precision and escapes CSV/formula input; it does not verify the chain by formatting a CSV.
- Progress messages are public display text only; no credentials, private capture data, signing material or internal secret-bearing errors. The client validates returned models and displays generic failures rather than dumping upstream errors.

## What can be tested now

Local invoice draft create/edit/save/reopen/delete, line totals and exact review; disabled unavailable services; pending-intent metadata retention; submitted-reference locking; corrupt storage protection; responsive/keyboard navigation; existing device/object checks. Tests that seed metadata or controller state are labelled component/integration tests, not real transactions. No fake successful engine is supplied.

## Required joint integration tests later

Real account creation/recovery; actual treasury policy and membership changes; real proposal creation with duplicate request/draft protection; proposal-bound physical acoustic exchange; independent votes and wrong participant/signature rejection; executable threshold and alternate-client bypass tests; actual payout plus receiver-balance/receipt checks; unknown outcome/reload reconciliation without a duplicate payment; receipt/CSV from those real records. Phone/laptop physical tests remain essential.

## Scope still pending

Context 2 has not started. No successful NEAR account, live acoustic session or payment flow is claimed. Visual redesign remains paused. GitHub Actions activation needs a credential authorized to write workflow files; the current token lacks `workflow` scope. The executable workflow proposal remains in `docs/testing/github-actions.example.yml`; local checks are not a CI run.

## Review fixes and local concurrency

App review fixed six important issues in one regression-tested pass: cross-tab draft overwrite/resurrection, hidden recovery metadata after damaged invoice storage, unrelated draft/proposal association, incomplete confirmed recovery, inaccessible submitted references, and incomplete independent-consent details. Navigation selection contrast was regraded as important after an actual computed-color failure and made immediate; no visual redesign.

Draft read/modify/write, reference updates and action-record acquisition use the same native Web Locks mutex. Saving rejects stale edit revisions; deleting cannot resurrect other records. This requires a current browser and HTTPS/localhost; unsupported browsers fail visibly instead of falling back to unsafe writes. Invoice recovery and protected metadata are loaded separately. Clearing invoice drafts retains action/reference metadata.

The journal stores exact operation-specific payment context before an engine call. Only proposal creation, or an already verified proposal association, can create a draft reference. A confirmed reconciliation must match request ID, action kind, treasury, recipient, exact amount, purpose and existing proposal/hash where applicable. Approval additionally confirms the original participant. Pending execution remains blocked. Independently discoverable submitted references allow readonly recovery after drafts are removed.

This client bookkeeping is not a financial security boundary: backend/contract idempotency, authorization and canonical outcome checks remain mandatory. Local storage can be cleared or manipulated; engine history must support independent account-based recovery. No live engine has been enabled or certified by these app tests.
