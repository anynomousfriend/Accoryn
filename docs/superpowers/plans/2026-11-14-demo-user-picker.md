# Demo User Picker Implementation Plan

**Goal:** Select known demo members and recipients across phone/laptop without typing account IDs.

**Architecture:** A Vite development middleware persists only public testnet IDs under ignored `.local/`; a browser client and shared page hook feed member/recipient controls. Local signing-account selection and all existing chain authority checks remain unchanged.

**Tech Stack:** Existing React/TypeScript/Tailwind, Node HTTP/fs, NEAR read-only RPC; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-demo-user-picker-design.md` (approved by user). Native execution retained from the user's selected workflow.

## Global constraints

Only `feat/near-tooling-testnet-rate-limit`; no main merge or push. No keys/photos/templates in the directory. Directory presence never authorizes signing or membership. Static builds retain manual fallback.

## Review focus

Concurrent registration and restart persistence; malformed/extra private payload fields; RPC refusal/outage; saved selections disappearing on refresh; imported remote IDs accidentally becoming local signers.

## Task 1: Shared directory

- [x] Write failing tests in `web/tests/demo-directory.test.ts` for bounded HTTP JSON, concurrent deduplication, on-chain admission checks, persistence/restart, malformed/corrupt storage and rejected unknown accounts.
- [x] Observe RED, then implement `web/server/demo-directory.ts`: middleware factory with injected verifier for deterministic failure tests and a real NEAR verifier by default. `GET /api/demo-users` and `POST {accountId}` return `{version:1,accounts:string[]}`.
- [x] Wire middleware into `web/vite.config.ts`; test real local HTTP behavior and verify GREEN.

## Task 2: User selection

- [x] Add failing browser tests for two independent sessions sharing real testnet IDs, member selection and recipient selection without typing, local signer isolation, and directory failure retaining selected values.
- [x] Implement `web/src/engines/app/demo-users.ts`, `useDemoUsers.ts` and `DemoUserPickers.tsx` for validated public data, refresh/error states and optional manual fallback.
- [x] Wire successful account creation/selection to publication in `TreasuryPage.tsx`; add member checkboxes to creation/governance and recipient selection to `VaultPaymentEditor.tsx` (including itemized editing).
- [x] Keep creator inclusion and exact payment review, and preserve selections when refresh fails. Verify focused browser tests with real read-only testnet admission.

## Task 3: Release

- [x] Run full relevant unit/browser suites, typecheck/build and production smoke checks. Use an independent read-only review under the preserved native workflow.
- [x] Document exact phone/laptop test steps and limits, commit a cohesive local feature change, restart the LAN server, and wait for manual feedback.
