# Guided Vault Flow Implementation Plan

**Goal:** A coherent account-to-receipt journey with per-member local object research checks.

**Architecture:** Preserve TreasuryFlow transaction, acoustic and reconciliation engines. Add scoped template storage, a reusable embedded object panel, payment-bound ephemeral acknowledgements, and responsive task views around the existing engine.

**Tech Stack:** React 19, TypeScript, Tailwind 4, native IndexedDB, existing DINOv2 worker and NEAR integration.

**Spec:** `docs/superpowers/specs/2026-11-14-guided-vault-flow-design.md`

Execution: native, as previously selected by the user. Use test-driven-development and verification-before-completion. Keep all changes local to the requested feature branch.

## Global constraints

No new verification server, custody change, arbitrary match threshold, mainnet/USDC claims, or same-room security claim. Preserve original request IDs and pending barriers. No scans, keys or generated test reports in Git.

## Task 1: Member object lifecycle

- [x] Add failing tests for account/vault isolation and ephemeral exact-payment acknowledgement, expiry and invalidation.
- [x] Verify RED.
- [x] Add namespaced template record keys, injectable controller storage and the embedded member object panel.
- [x] Verify actual IDB isolation and DINOv2 fixture comparison, plus unit tests. Fixtures do not prove camera behavior or identity accuracy.

## Task 2: Guided workspace

- [x] Add failing browser tests for home, task navigation, staged creation, no global-object signup dependency and hidden advanced workflows.
- [x] Verify RED.
- [x] Replace the operations console with account, vault, member object, payment, approval, activity and settings views; retain a single engine and existing financial guards.
- [x] Put object acknowledgement directly before approval signing, with fresh storage and context validation; clear it on stop/hide/context changes.
- [x] Improve draft editor context and invitation links; retain compatibility routes for diagnostics and legacy local drafts.
- [x] Verify focused browser tests, full unit/browser suites, typecheck, build and production route smoke checks.

## Task 3: Release checkpoint

- [x] Exercise the real testnet flow once, respecting faucet quotas and retaining original keys/intents on ambiguous failures.
- [x] Record exact automation boundaries, update context/manual testing docs, and make a cohesive local commit after checks.
- [x] Start HTTPS LAN server and provide exact two-device manual steps. Wait for user feedback before further feature work.

## Review focus

Account switching mid-request; IDB failure or replacement from another tab; session expiry during scan; payment lookup failure retaining stale data; unknown transfer outcomes after navigation/reload.

Live verification boundary: the real run created both testnet accounts and the vault, then camera permission was denied. It did not complete object enrollment, acoustic approvals or payout. This is recorded as a blocked physical run, not a passing end-to-end test. Manual acceptance remains pending.
