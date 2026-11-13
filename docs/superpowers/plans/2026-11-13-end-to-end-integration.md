# End-to-end integration implementation plan

> Native execution as previously selected. Use executing-plans and TDD; one fresh whole-branch review at the end. The user's instruction batches acceptance after integration; no routine plan approval round.

**Goal:** connect account, treasury, acoustic approval, execution and receipt engines into a real testnet app journey.
**Architecture:** typed dedicated real app adapter with durable operation metadata and focused read/session modules; basic existing screens consume it. No mainnet, synthetic success provider or new custody mechanism.
**Tech stack:** existing React/TypeScript/Vite, near-api-js 7.5.3, ggwave 0.4.0, pinned DINOv2 worker, deployed gate.
**Spec:** docs/superpowers/specs/2026-11-13-end-to-end-integration-design.md

## Global constraints

Testnet only; exact atomic strings; no private keys/raw captures in logs or Git; no automatic similarity threshold; no silent audio fallback; decoded sound is not consent; unknown writes must reconcile original IDs. Keep domain-specific state explicit and reject stale sessions.

## Review focus

Canceled helper creation must retain the same key and account intent. Expired evidence must fail at command execution, not merely button render. Void gate callbacks must confirm session/vote business state. Governance member changes must update both human roles atomically. Receipt pointers must be verified against exact transfer and final proposal state.

## Task 1 — real service boundary, account/session, reads and recovery

- [x] Write failing tests for real adapter authorization and protocol guards, malformed session data, absent-key and expired research-session handling, durable operation identity and canonical recovery.
- [x] Implement `engines/app/{research-session,operations,protocol,engine}.ts` and the typed `TreasuryFlow` service. Preserve the legacy v1 workspace boundary. Keep app signatures consistent with engine APIs. Observe RED→GREEN; keep fixture tests labelled separately from real RPC reads.
- [x] Update ledger and commit cohesive service foundation after unit/type checks.

## Task 2 — treasury, proposal, ceremony, settlement and governance

- [x] Test policy conformance, request-tag identity, retained unknown outcomes, exact settled receipt verification, expired/wrong-session/member/callback failure and membership recovery; observe failures before adapter behavior.
- [x] Implement focused `engines/app/writes.ts` using existing journal and authoritative reads. Persist public operation metadata; keep acoustic seed only in memory. Expose explicit host/listener and separate approval. Confirm business outcomes after every journaled stage.
- [x] Exercise actual testnet reads/writes with isolated newly created test accounts, never other contributors' credentials; record public evidence only. Commit after checks.

## Task 3 — connected UI and manual handoff

- [ ] Write failing browser tests for scan-confirmation-to-workspace, account input/local key selection, actual treasury/read-only board, host/listener lifecycle, approval consent and explicit pending reconciliation.
- [x] Wire `/treasury/` and `/board/` to the dedicated real adapter; add basic account/treasury/ceremony/governance/board screens, update existing tests to distinguish disabled config from real read-only availability. Add explicit lock and expiry timer; update runtime docs/config.
- [x] Run complete web checks, packaged routes and native HTTPS browser flow. Run a physical same-device exchange; actual multi-device and live camera acceptance remain manual. If local Rust is unavailable report contract coverage rather than claiming a rerun.
- [x] One final independent reviewer; fix important findings with RED→GREEN regressions and rerun relevant full checks. Commit the local feature branch; no automatic merge. GitHub reports existing origin PUBLIC, so no public push/PR under the private-development agreement. Start test server and provide exact manual test steps and evidence.

## Evidence checkpoint

Fresh full check: 197 unit tests (195 passed, 2 opt-in live tests skipped); 67 browser tests (66 passed, 1 opt-in live test skipped); typecheck, build and packaged production smoke passed. Separate live browser payment journey passed with actual laptop microphone/speakers and a verified native transfer; its object handoff used explicitly labelled real image inference fixtures. An additional governance run was blocked by HTTP 429 during fresh account setup. See docs/testing/end-to-end-integration.md.

Tasks 1–3 implementation and automated regression coverage are complete. Manual physical acceptance, additional live governance writes remain separate acceptance gates; do not mark those as passed from fixtures.

Final independent review completed. All three important findings fixed with failing regressions first; board retry treated as functional recovery and fixed in the same pass. Final whole suite passed. Governance live-write acceptance remains blocked by the helper during new-account setup, as explicitly recorded; no public push or main merge.
