# Context 1 delivery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the already-selected native execution. Test-first; user explicitly instructed continuing independently on a separate branch while Context 2 has not started. No further routine design-question rounds; consequential custody/policy changes remain outside this lane.

Goal: implement the Context 1 client, local preparation workflow and small versioned service boundary, ready to integrate real engines without overlapping their implementation.

Authority: CONTEXT_1.md and user instruction 2026-11-13 to continue app work separately, anticipating integration and avoiding junk/merge conflicts.

Constraints: no Context 2 implementation, simulated successful services, invented accounts/balances, signing or payout. Preserve existing camera research and paused visual redesign. Batch manual handoff at user request. State precisely which flows require future real adapters.

## Tasks

- [x] Stabilize guide/crop alignment, observed failing layout test then correction at mobile/desktop sizes.
- [x] Implement exact-amount, spreadsheet-safe receipt CSV formatter; observed missing-module failures before real implementation. Real receipt integration remains dependent on Context 2.
- [x] Define one app-owned versioned service contract and one binding file. Default capability state is unavailable and commands fail explicitly. Engine implementations live in Context 2 paths; never duplicate them here. Cancellation and action outcomes are explicit; no retry automatically resends a financial action.
- [x] Implement browser-local invoice/payment drafts: strict strings for atomic amounts, validated fields, line-item arithmetic, safe persistence/read/delete and review. This is a draft, not a chain proposal or payment. Do not store keys, object photos or unrelated raw engine data.
- [x] Build the connected workspace: account/recovery, team/policy, exact payment review, acoustic ceremony, explicit consent, shared result and receipt/export panels. Enable network-dependent operations only with matching capability/services; consume authoritative returned values. Local preparation works without a signer. Changing draft/proposal clears stale session/consent. Reload never auto-executes an action.
- [x] Test actual browser persistence, form/review/navigation, cancellation and unavailable integration paths; test pure contracts/validation without presenting those tests as real testnet payouts. Add source-only component contract tests where useful; no production test endpoints.
- [ ] Run full checks, production routes and one independent review; commit cohesive phases on this branch. Publish a private app checkpoint, list unavailable engine-dependent behavior, update Context 1 checkboxes without claiming integration completion. No merging into main automatically.

Interfaces: app-owned `web/src/integration/services.ts` (types/validation boundary) and `bindings.ts` (single engine wiring point); `web/src/workspace/` contains draft/domain persistence and UI. Existing receipt formatter lives in `web/src/payments/`. Context 2 owns engines/contracts/services and need not edit app components. Root web dependencies are coordinated here; avoid adding packages unless needed.

Final review: six Important findings and regraded navigation contrast fixed with RED→GREEN regressions; full 33-unit/51-browser/type/build/production checks pass. No live adapters or financial E2E are claimed. Publication/manual handoff follows; CI activation and visual acceptance remain conditional.
