# Reference-led treasury redesign implementation plan

> **For agentic workers:** Execute natively, task-by-task, following the installed test-driven-development and verification-before-completion skills. The user approved implementation/testing without further design approval rounds.

**Goal:** Ship a coherent animated editorial landing page and a usable, connected treasury workspace in the approved reference direction.

**Architecture:** Keep transaction/media/inference engines unchanged. Add reusable presentational workflow components; reorganize workspace navigation around existing task state and preserve legacy hashes. Extend Tailwind design tokens and component styles rather than adding a second styling system.

**Tech Stack:** React, TypeScript, Vite, Tailwind, CSS/IntersectionObserver, existing Playwright and Node tests.

**Spec:** `docs/superpowers/specs/2026-11-14-variant-treasury-revamp-design.md`

## Global constraints

- Local branch during implementation; merged into `main` as `ab53a45` after user approval. Preserve original requests and signing safeguards.
- Native NEAR testnet only; object comparisons are research checks, audio is relayable.
- No permission prompts, writes or inference in the illustrative landing walkthrough.
- Reduced motion, keyboard focus, mobile touch targets and full account IDs remain supported.
- Existing functional routes and legacy task hashes remain reachable.

## Review focus

- Root legacy links must still enter treasury; fresh root visits enter landing (Task 1).
- Browser Back/Forward must restore the chosen workspace destination (Task 2).
- Pending submissions remain visible across navigation and cannot be duplicated (Task 2, existing regression suite).
- Landing motion must pause and respect reduced motion without hiding explanatory content (Task 1).
- Long account IDs and narrow screens must not overflow or obscure primary actions (Task 3).

### Task 1: Landing, shared previews and reference visual foundations

**Files:** `web/src/landing/LandingPage.tsx`, new `web/src/design/WorkflowPreview.tsx`, new `web/src/landing/TreasuryArtwork.tsx`, `web/src/design/tokens.css`, `web/src/styles.css`, `web/src/design/primitives.tsx`, `web/src/routes.tsx`, `web/tests/variant-redesign.spec.ts`, `web/tests/landing.spec.ts`.

**Interfaces:** `WorkflowPreview({ chapter: "account" | "payment" | "approval", illustrative?: boolean, children?: ReactNode })`; pure display components for account summary, payment facts and approval progress consumed by landing and live app. `TreasuryArtwork` is decorative and owns visibility/pause control only. Existing ActionLink/Button interfaces preserved.

- [x] Add failing browser tests for landing default entry, legacy hash compatibility, labeled example walkthrough, no media/network-write side effects, pause/reduced-motion behavior and mobile no-overflow.
- [x] Run `npx playwright test tests/variant-redesign.spec.ts` and verify meaningful failures.
- [x] Implement original floating treasury forms, editorial landing, visible linked CTA, selectable scroll chapters using CSS/IntersectionObserver and shared presentational components. Update tokens and primitive styles. Preserve `/landing/` alias and recognized root hashes.
- [x] Run new browser tests and typecheck. Existing copy/layout tests will be migrated only where the approved interface changes; preserve their behavioral assertions.
- [x] Commit cohesive landing/system phase after checks.

### Task 2: Contextual workspace and connected task presentation

**Files:** `web/src/engines/app/GuidedWorkspace.tsx`, `web/src/engines/app/TreasuryPage.tsx`, shared preview components, `web/tests/guided-workspace.spec.ts`, `web/tests/variant-redesign.spec.ts`.

**Interfaces:** Preserve `Task` legacy identifiers and `onNavigate(task)`. Export `taskFromHash` with aliases for new categories. Overview maps to vault; Members maps to object; Payments groups payment/approvals/activity; Account is utility. Use pushState for explicit navigation and popstate/hashchange for restoration without duplicate history entries. Preserve onNavigate busy safety checks.

- [x] Add failing tests for grouped navigation, payment subnavigation, history, legacy entry and account path selection.
- [x] Run targeted browser tests to establish failures.
- [x] Replace oversized numbered sidebar with contextual navigation/header. Make headings task-specific, create/use-saved account chooser, retain consent and local-key checks. Surface loaded member roster in Members and share payment facts/approval summary presentation with landing. Keep engine authorization and reconciliation code unchanged.
- [x] Run guided navigation, picker, treasury-flow, signing and settlement suites; fix regressions before phase commit.
- [x] Commit coherent working-app phase.

### Task 3: Supporting screens, visual QA and integrated release

**Files:** `web/src/App.tsx`, object/acoustic registration and board/workspace presentation where required, styles, HTML metadata, tests affected by routes, `web/scripts/verify-production.mjs`, new `docs/testing/2026-11-14-reference-redesign.md`.

**Interfaces:** Keep supporting route and controller interfaces unchanged. All primary surfaces use shared colors, typography and form states. Main app uses 44px+ touch controls and 16px+ mobile inputs; numeric details stay stationary.

- [x] Pin overflow/contrast/focus checks for 320/390/768/1440px, long IDs, non-Latin text, pending/error and empty states; exercise existing functional regressions.
- [x] Update surfaces and route expectations to approved design; retain useful tests rather than deleting checks to get green output.
- [x] Run `npm test`, `npm run typecheck`, full `npm run test:browser`, `npm run build`, `npm run test:production` in `web`. Report fixture vs physical/live coverage explicitly.
- [x] Inspect desktop/mobile screenshots and motion using Chromium. Check pause/reduced-motion, keyboard navigation and unknown/pending transaction state. Use one independent whole-branch reviewer for native execution.
- [x] Commit verified release, run local dev with existing real configuration, give laptop/phone URLs and exact manual steps. Do not expose keys or request new faucet accounts to bypass 429 cooldowns.

## Self-review

All spec sections map to these three tasks. No new dependency or contract deployment is required. Desktop sticky previews become ordinary stacked content on mobile. Illustrations never mount live controllers. Existing legacy workspace stays secondary and real transaction coverage remains separate from UI fixture tests. Manual camera/audio and a two-device testnet ceremony remain user checkpoints.


## Execution record

Implemented natively on `design/variant-treasury-revamp` and merged into `main` as `ab53a45` after user approval. Shared tokens, routes and navigation were delivered as one cohesive implementation phase because the UI regression suite spans both landing and workspace behavior. Independent review found and rechecked contrast, mobile help, offscreen playback and navigation-copy fixes.

`npm run check` passed on the release source: 213 unit tests passed / 2 opt-in skipped; 86 browser tests passed / 2 opt-in skipped; typecheck, production build and production smoke passed. The build retains a large-bundle warning. No new animation dependency was installed. A self-hosted OFL display font and its license were added.

Manual acceptance remains pending: real personal-object capture, physical acoustic reception and a funded two-device testnet payout. Follow `docs/testing/2026-11-14-reference-redesign.md`; do not start another feature before the user's results.
