# Context 1 — app delivery and feature integration

Updated: 2026-11-13. Owner: this working session and the user. The other contributor's lane is [Context 2](CONTEXT_2.md). These two tracked files replace the old discovery brief as the shared development context. Read AGENTS.md first.

> **Incoming from Context 2 (2026-11-13), read before continuing this lane.**
>
> **Decisions, now specified:** Context 2 has specified and its owner has approved the custody, enforcement and verifier design, so the "unfinished architecture" caveat below is resolved for testnet.
> - Custody is object-only app-made accounts with an IndexedDB key; the object is a local unlock only.
> - The on-chain ceremony gate is the DAO's only transfer approver.
>
> See [CONTEXT_2.md](CONTEXT_2.md) and [the threat model](docs/security/ceremony-threat-model.md).
>
> **Delivered:**
> - the gate, live on testnet;
> - engines under `web/src/engines/`;
> - the `/acoustic-check/` lab route;
> - `npm run dev:lan` (HTTPS for phones);
> - testnet scripts;
> - a pre-bundling fix for a cold-start Vite reload that broke `object-controller.spec.ts`.
>
> **Not changed:** `bindings.ts` still exposes no capabilities, and no existing Context 1 screen changed behavior.
>
> **Coordination:** the Context 2 owner allowed that lane to also edit UI and routes through reviewed PRs, to meet the deadline. Coordinate before editing `WorkspacePage.tsx`.
>
> **Where to go next:**
> - Integration plan and the proposed `AppServices` v2: [docs/integration/context-two-engines.md](docs/integration/context-two-engines.md).
> - Reproduce everything locally: [docs/testing/context-two-local.md](docs/testing/context-two-local.md).
> - **npm 11 pitfall:** `npm install <pkg>` prunes two `@emnapi` lock entries and breaks `npm ci`. Restore them from `main`'s lockfile, as described in the engines guide.

## Connected integration checkpoint — 2026-11-13

Branch: `feat/end-to-end-integration`, isolated from main `9b7c2f8`. This supersedes the older integration backlog below. Functional changes remain on the local feature branch pending review/manual acceptance.

- [x] Typed real adapter under `web/src/engines/app/`, connected `/treasury/`, and keyless `/board/?dao=…`. The v1 draft workspace remains compatible; it links to the actual connected flow.
- [x] Explicit ten-minute **manual research confirmation** after a real fresh comparison; no invented image threshold or claim of secure object login. Local key ownership is confirmed as FullAccess on-chain before selection/signing.
- [x] Testnet helper account creation retains its original public-key binding and local signing key across retries. Extractable unencrypted browser custody is disclosed.
- [x] Create/fund gated Sputnik vaults, read actual members/governance/tiers/spendable balance, inline invoice save/review, durable submission references and real proposals.
- [x] Explicit host/listener ceremony; independent member consent; canonical callback checks; expiry/cancellation/membership guards; verified settlement, evidence publication and CSV.
- [x] Durable engine metadata plus signed-byte journal and shared UI pending barrier. Unsigned reconciled requests get a cancellation marker before releasing their barrier, preventing a delayed submit from racing reconciliation.
- [x] Governance UI for factory auto-update hardening and atomic complete-member replacement; threshold and full proposal are read from chain. Governance live-write acceptance remains separate below.
- [x] Real native Chrome payment journey completed with actual same-laptop microphone/speakers: two new accounts → funded vault → invoice → two attestations → exact 0.05 testnet NEAR payout → verified published receipt. Public tx: `EA1nmm93YpiqBKy731Rc5Tba87nzrgZgpsqKUf8nCR5A`.
- [ ] Manual live camera/object discrimination and phone/laptop acoustic matrix. Automated fixture inference and physical laptop loopback do not prove these.
- [ ] Additional live governance-write exercise: a subsequent fresh-account setup was refused by the testnet helper with HTTP 429 before governance writes. Do not claim that exercise passed.
- [ ] User accepts the connected manual journey. Follow [the exact checklist](docs/testing/end-to-end-integration.md); pause further features for results.

No gate-key deletion, mainnet spending, public publication or automatic main merge is included. GitHub currently reports the existing origin as PUBLIC; this branch stays local under the private-development agreement.

## Product and fixed decisions

Accoryn is the shared repository name; app-wide branding is still undecided. Build a new mobile/desktop web app for teams approving treasury payments together. The intended journey is personal-object research access → shared NEAR treasury → exact payment review → acoustic participation exchange → explicit independent approvals → authoritative settlement and receipt.

Keep the two central ideas: familiar personal-object enrollment/access and an in-person acoustic approval ceremony. Use only built-in camera, microphone, speaker, display and supported optional sensors. No external hardware, NFC tags, hardware security keys or GPS. A desktop path cannot require phone motion sensors. The user selected an object-only research prototype; do not introduce a mandatory passkey as a routine implementation choice.

Photographs are not cryptographic secrets. Audio communication does not establish unrelayable proximity or distinct-human attendance. Hearing a challenge is not consent to pay. Context 2 must specify custody, recovery, verifier trust and enforceable NEAR policy before signing or payment depends on those mechanisms. This file does not approve that unfinished architecture.

Functional features come first; visual redesign, dithered artwork, scrollytelling, motion and new branding remain paused. Retain React/TypeScript/Vite/Tailwind and the current basic screens. Return to Emil's design guidance after functional acceptance.

## Completed and current checkpoint

`[x]` means implemented/verified as described, not a claim of production security or universal device compatibility.

- [x] Git history preserved in the shared Accoryn repository; cohesive feature commits and review branches in use.
- [x] Real camera preview/frame capture, measured microphone input and speaker playback with explicit audibility confirmation.
- [x] User accepted the three device-check happy paths on 2026-11-12. Browser/device versions and all denial/cancellation/phone-laptop combinations were not supplied.
- [x] Connected readiness → object-registration navigation, including direct entry for returning users.
- [x] Feature 2: three-view capture/review/retake, local DINOv2-small inference, one versioned IndexedDB template, explicit replacement, fresh-scan comparison and deletion.
- [x] Actual baseline: DINOv2-small ViT-S/14, q8 WASM worker, Transformers.js 4.3.2. Immutable model/runtime provenance is in `web/src/object-registration/model-manifest.json`. Photos are transient; embeddings and metadata are stored locally.
- [x] Real scores: three cosine similarities, top-two mean and measured inference time. No match/deny threshold, account unlock or wallet creation.
- [x] Independent review's four important cancellation/recovery findings fixed with regressions. Latest full check: 17 unit tests, 36 browser tests, TypeScript, build and packaged-model smoke passed. The subsequent hosting-only build repair passed build/production smoke again.
- [x] Private preview deployed after removing an unused oversized runtime fallback; access remains owner-private. Draft [PR #1](https://github.com/anynomousfriend/Accoryn/pull/1) is open. Main has not been merged automatically.
- [ ] User manually accepts Feature 2's complete live capture → save → fresh-scan comparison journey. Automated Chrome returned NotAllowedError for physical camera access; real photo fixtures are not camera E2E.
- [ ] Device/browser matrix, independent capture-session discrimination and spoof testing. Context 2 owns recognition research; this lane owns the app/device acceptance record.

Local app: http://127.0.0.1:5173/ . Direct feature: http://127.0.0.1:5173/object-registration/ . Private HTTPS preview: https://team-treasury-device-lab.glassygrant5.chatgpt.site/object-registration/ . Authenticated hosted rendering still requires user verification; deployment success is not a hosted-camera test.

The crop-guide mismatch was fixed on the Context 1 delivery branch; a geometry regression now verifies the visible guide against the processed square at phone/laptop widths. Full evidence and manual steps: [Feature 2 checklist](docs/testing/feature-02-object-registration.md).


## Context 1 app implementation checkpoint — 2026-11-13

User clarified that Context 2 has not started and asked this lane to continue independently on separate branches, batching manual testing at the end. Current branch: `feat/context-one-delivery`, based on merged `origin/main` (`7be5f67`). No engine implementation, fake successful provider or new npm dependency was added.

- [x] Real local invoice drafts with validated account spelling/dates/lines, exact 24-decimal NEAR arithmetic, save/reopen/delete and explicit exact-payment review.
- [x] Account/recovery, team/policy, proposal/session/consent and receipt/export app sections with one typed adapter boundary. Unavailable operations remain disabled; no fake accounts, balances, approvals, decoded sound or receipts appear.
- [x] Persistent unknown-action journal with operation-specific payment context and native cross-tab locking; clearing drafts retains it. Submitted proposal references remain independently discoverable after reload or draft deletion and lock the original draft; changing a payment requires an explicitly new draft/review.
- [x] Runtime response validation and safe CSV export formatting, preserving atomic amounts and pending/unknown outcomes. Real receipts are not fabricated to enable export.
- [x] Actual browser draft persistence/corruption tests, responsive layouts, production workspace smoke and native object/model regressions. Latest full run after independent review fixes: 33 unit / 51 browser tests, typecheck/build/production smoke passed.
- [x] Primary-source problem/alternative assessment in [problem evidence](docs/research/problem-evidence.md). Customer interviews and demand validation remain unperformed.
- [x] Small app-owned [adapter handoff](docs/integration/context-one-adapter.md): exact types in `web/src/integration/services.ts`, response guards in `validation.ts`, single wiring point `bindings.ts`. Context 2 owns its actual engines and need not edit React screens.
- [ ] Real account/custody, treasury, acoustic, independent approval, settlement and receipt integration: awaiting reviewed Context 2 adapters and actual joint tests.
- [ ] Physical/manual acceptance: [app checklist](docs/testing/context-one-manual.md), plus existing object-registration checklist. No sensor compatibility or financial E2E result is inferred from local fixtures.
- [ ] GitHub Actions activation: current credential was checked and still lacks workflow-writing permission. Executable workflow example is retained; local checks are not CI.
- [ ] Visual redesign: still paused until functional acceptance, as requested. Public submission/production/mainnet actions are not performed.

The original backlog below remains an end-to-end acceptance tracker: an unchecked integration item can have its app-side implementation above complete. It must not be checked off as a working payment capability before real engine integration. The adapter is a versioned client-facing proposal, not approval of an undisclosed custody or treasury-security architecture.

## Our exclusive implementation backlog

Build these as connected functional slices, not disconnected mock success screens. Boxes remain unchecked until their actual deliverable passes its checks.

1. [ ] **Accept and stabilize object registration.** Collect user results, fix camera/retake/save/replacement/reset/suspension failures, update the device matrix and manual checklist. Do not invent thresholds from a few positive examples.
2. [ ] **Integrate the agreed account/access service.** Build onboarding, consent, loading/failure/retry and recovery screens using Context 2's tested custody/account adapter. Show a NEAR testnet account only after real creation/verification. Keep this blocked until custody/recovery design and signer behavior are explicit.
3. [ ] **Team and treasury journey.** Create/join/select treasury screens; display actual members, roles, balances and approval policy from the Context 2 adapter. Never present a hardcoded 2-of-3 rule as chain policy. Membership changes must invalidate stale views/sessions as specified by the engine.
4. [ ] **Payment proposal and exact review.** Validate recipient, asset, atomic amount, purpose, expiry and optional invoice reference; submit via the adapter; show the same immutable proposal to every participant. Any edited payment requires renewed review and a new bound session.
5. [ ] **Acoustic ceremony UI.** Explain permissions, start/stop/retry and unsupported devices; display actual per-participant engine progress; clear resources on suspension/navigation. Call Context 2's engine rather than implementing a competing modem or trusting client success flags. An explicit audible alternative requires an agreed policy; no silent downgrade.
6. [ ] **Independent consent and shared status.** Separate decoded audio from signing approval. Display eligible approvals, missing members, expiration and rejected/unknown outcomes from authoritative engine state. Reconnect/reload without duplicating payment actions.
7. [ ] **Invoice, receipt and export UX.** Invoice form/reference and payment purpose; render confirmed/pending/failed/refunded outcomes from Context 2 reconciliation. Show proposal/transaction evidence. Export spreadsheet-safe CSV using real receipt fields; neutralize formula injection. UI owns export formatting; Context 2 owns settlement truth.
8. [ ] **App-level automated and physical tests.** Browser → real adapter → testnet/backend → receipt coverage; actual sensor failures, interrupted flows, reloads, keyboard and phone layouts. Keep fixture/controller-state tests labelled separately from physical-camera/audio tests. No fake media, fabricated balances, mock payout success or dry quotes counted as completed transfers.
9. [ ] **Delivery and contributor ergonomics.** Root web dependency/lockfile coordination, reproducible asset preparation, build-size limits, test commands, private preview updates and release notes. Activate GitHub CI when an authorized workflow-capable credential is available; local checks are not GitHub CI.
10. [ ] **Problem validation and submission evidence.** Maintain audience/problem/alternative evidence and incorporate user-provided team feedback. Validate whether meeting-based approval reduces a real problem enough to justify friction. Do not send outreach or publish without authorization. Document the demonstrated NEAR role and actual test results; recheck event rules before submission.
11. [ ] **Visual work after functional acceptance.** Revamped branding and responsive design, abstract/dithered assets, considered motion and landing-page storytelling. Preserve reduced motion, readable payment data and immediate reliable financial-state feedback. Do not start this simply because the UI looks basic.

## Ownership boundaries — avoid editing the same implementation

| This lane owns | Context 2 supplies; we integrate it |
|---|---|
| `web/src/App.tsx`, routes, React pages/components, design/styles/assets, existing readiness controller | Vision algorithms and evaluated replacement engine |
| Current object-registration screen/controller/store and its baseline adapter wiring | New engine implementation under `web/src/engines/vision/`; no parallel rewrite of registration UI |
| App session screens, permissions copy, capture UX and resource-lifecycle integration | Acoustic codec, device calibration, challenge/session protocol and verifier |
| Forms, payment review, user consent, invoice/receipt rendering, CSV formatting | Account/signer/custody adapter, treasury authority, execution and reconciliation |
| Browser integration tests, user manual acceptance and release coordination | Engine/contract/backend tests, real-device channel measurements and security evidence |
| Root `web/package.json`/lockfile, build/hosting scripts, FEATURE_STATUS, Context 1 | Dependencies requested through Context 2 PRs; its separate services/contracts manifests are its own |

Context 2 owns `contracts/`, `services/`, future `web/src/engines/`, engine evaluation scripts and security/engine documentation. Those directories are planned ownership, not claims that code already exists. Existing baseline worker/manifest files stay with Context 1 until an explicit handoff PR moves them; do not edit them concurrently. Interface changes are reviewed across lanes before either side depends on them. AGENTS.md and shared integration assumptions change by agreement, not unilateral edits.

## Integration order and gates

- Continue Feature 2 manual acceptance here. Context 2 may do isolated research/engine work in parallel; do not activate unverified engines in the user flow.
- First agree the account/custody and treasury boundary, then integrate one real testnet account/treasury slice. Do not block that slice on DINOv3, a custom modem or cross-chain expansion.
- Add the real acoustic engine and enforceable payment-policy integration, then complete one invoice-to-receipt demonstration.
- Social Money is the lead target; Open Innovation is additional. Real-World Money remains conditional on a working invoice/payment/reconciliation flow. These are targeting decisions, not organizer eligibility guarantees. See [track evidence](docs/hackathon/track-alignment.md).
- Escrow, flexible thresholds, reputation, inheritance and cross-chain settlement are not core-demo prerequisites. Optional backend extensions belong to Context 2; their future UI integration belongs here. Mainnet spending, public repository visibility changes and final submission need their own concrete authorization.

## Git and shipping protocol

PR #1 is now merged into main. This lane continues on `feat/context-one-delivery` from `origin/main`; the other contributor should use its own engine branch and review the adapter handoff before integrating. Each contributor uses a separate feature branch/worktree. Prefer short PRs, agreed interfaces first, then independent implementation. No force pushes, history rewrites or unreviewed merges into main. Root web dependency edits have one coordinating owner here.

For every feature: meaningful failing test → real implementation → appropriate full checks → review → testable release with exact steps → wait for manual results and fix failures. Report unsupported behavior rather than simulating success. Keep private images, credentials, signing keys, binaries, generated reports and research conversation notes out of Git. Reproducible licensed dataset fixtures are computational test inputs, never personal captures or production artwork.

## Next action

Finish the independent app review and private checkpoint release, then ask for batch manual testing of object registration and `/workspace/` invoice preparation. Share the adapter handoff with the other contributor. Keep engine-dependent backlog items unaccepted until its real implementations and joint tests exist.
