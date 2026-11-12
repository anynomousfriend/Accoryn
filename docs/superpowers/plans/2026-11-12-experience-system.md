# Treasury Experience System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user already selected native execution, with one fresh independent reviewer before handoff; preserve that choice.

**Goal:** Ship the approved responsive Tailwind visual system, original assets, landing page and editable UI reference while preserving the real device checks.

**Architecture:** Keep the existing React/Vite app and media controller. Introduce semantic styling tokens and small presentation primitives, then a read-only component reference and message-led landing page. Use ordinary document links for the three routes so leaving the media page releases its resources; emit static route entry pages for private hosting rather than depend on an unverified SPA rewrite.

**Tech Stack:** Existing pinned React, TypeScript, Vite, Tailwind CSS, lucide-react, Node test runner and Playwright; native CSS/WAAPI for illustration motion. Locally hosted licensed Inter and Newsreader fonts. No new router, motion, wallet or backend dependency for this phase.

**Spec:** [Approved experience design](../specs/2026-11-12-experience-system-design.md), [editable direction board](../specs/2026-11-12-experience-direction.svg).

**Track context:** [Track alignment and implementation evidence](../../hackathon/track-alignment.md). This plan implements UI gate 1 only; later functional gates are not silently included here.

**Approval:** Visual design and this implementation plan approved on 2026-11-12. Native execution is already selected. The user's model/audio question is recorded in [baseline experiments](../../research/vision-audio-baselines.md); it does not add those integrations to the UI phase.

## Global Constraints

- Continue the existing React/Vite/Tailwind stack.
- Working product label: Team Treasury. This is not a final brand-name decision.
- Do not implement wallet access, treasury contracts, signing, or transfer behavior in this design phase.
- Do not change the shipped readiness controller or its permission lifecycle as a side effect of visual work.
- No mandatory external hardware or location tracking. Preserve object-only research and acoustic participation as planned concepts with their stated security limits.
- Use template fields (amount, recipient, approved count), not plausible fake treasury data.
- State selection is labelled “Inspect state,” never “Send” or “Approve.”
- No remote runtime font, analytics or illustration requests. Keep upstream font licenses; `font-display: swap`.
- Use the approved color values, spacing/radius scale and motion curves from the spec. Functional text contrast at least 4.5:1; focus/control boundaries at least 3:1 where required. Touch actions at least 44 × 44px.
- Keyboard-triggered UI changes are immediate. Hover feedback is gated by hover + fine pointer. Reduced motion presents complete static artwork with only short opacity feedback.
- No automatic sensor prompts, fabricated media, synthetic API success, or simulated money behavior. Reference-page design states must remain labelled “Design reference — no transaction.”
- The current feature's physical-device acceptance remains pending. Design work is authorized; the next functional feature still waits for those results.
- Retain private development and coherent phase commits. Do not merge the readiness PR, expand GitHub permissions or publish the repository as part of this UI work.

## Review Focus

1. Direct navigation/reload at `/device-check/` or `/design/` on static hosting must load the intended page, not depend on Vite's dev-server fallback.
2. A real readiness session must reset when following a document link or returning via browser history; no stale “confirmed” state or delayed audio after navigation.
3. Rapid Replay/state changes and hidden-tab transitions must cancel prior illustration work without stacking animations or delaying controls.
4. Keyboard use and reduced motion must preserve complete content, visible focus and immediate status updates, without decorative movement.
5. Long account/recipient labels at 320px and reflow equivalent to 200% zoom must remain readable, copyable and free from horizontal page overflow.

## Files and interfaces

| Path | Responsibility |
| --- | --- |
| `web/src/design/tokens.css` | Canonical semantic Tailwind theme, motion and type tokens |
| `web/src/design/tokens.json` | Tool-readable export of approved foundations, not an independent runtime theme |
| `web/src/design/primitives.tsx` | Presentation-only Button, ActionLink and StatusBadge |
| `web/src/design/SharedFrame.tsx` | Accessible illustration composition, bounded replay, cancellation and reduced-motion behavior |
| `web/src/design/ExperienceReference.tsx` | Token/type/component reference and labelled static payment-state study |
| `web/src/landing/LandingPage.tsx` | Approved messaging, locally hosted artwork and links to actual readiness |
| `web/src/routes.tsx` | Select landing, device check, design reference or not-found view from normalized pathname |
| `web/src/main.tsx` | Mount the route-selected view and shared styles |
| `web/src/App.tsx`, `web/src/styles.css`, `web/index.html` | Apply foundation to readiness and document metadata; preserve media behavior |
| `web/public/assets/experience/*.svg`, `manifest.json` | Original shared-frame, object-study and signal-bridge assets with usage/alt-text guidance |
| `web/public/fonts/` | Official font files and their retained license files |
| `web/scripts/create-route-pages.mjs`, `web/package.json` | Copy built entry HTML into route directories after a successful Vite build |
| `web/tests/experience.spec.ts`, `static-routes.test.ts` | Browser behavior/accessibility/layout and emitted-route verification |
| `web/tests/device-check.spec.ts` | Existing native-media tests retargeted to the readiness path plus navigation regression |
| `docs/design/experience-system.md`, `docs/testing/feature-ui-experience.md`, `README.md` | Component/asset usage, manual acceptance and reproducible setup |

Leave `web/src/device-check.ts` and `web/src/media-utils.ts` unchanged unless an independently reproduced regression requires a separate test-first fix.

## Task 1: Usable design reference, original assets and motion foundations

**Files:** Create tokens, primitives, SharedFrame, ExperienceReference, experience assets/fonts and `experience.spec.ts`; modify `main.tsx`, shared styles and initial route selection. Keep `/` showing readiness until Task 2 establishes the landing page.

**Interfaces:**
- `Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' })` and `ActionLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: 'primary' | 'secondary' | 'quiet' })` preserve native semantics.
- `StatusKind = 'neutral' | 'active' | 'success' | 'warning' | 'danger'`; `StatusBadge({ kind, children }: PropsWithChildren<{ kind: StatusKind }>)` supplies text plus a semantic icon, never color alone.
- `PaymentStudyState = 'review' | 'participation' | 'approval-recorded' | 'submitted' | 'confirmed' | 'rejected' | 'expired' | 'unknown'`; `ExperienceReference()` uses these only as explicitly selected design specimens, not transaction state.
- `SharedFrame({ interactive?: boolean })` exposes a native “Replay illustration” button only when interactive; controls no payment or device state. Artwork remains meaningful with motion disabled.
- `renderRoute(pathname: string): ReactNode` normalizes trailing slashes. At this task boundary only `/design` is new; the existing root remains usable.
- `manifest.json` records each original SVG's file, role, recommended alt text, background and movable layers. Reusable primitives and artwork are consumed by Task 2.

- [x] **Step 1: Write failing real-browser checks for the reference page.** Name the tests `reference is explicit and never requests device access`, `state inspection preserves proposal details`, `semantic controls remain readable`, and `motion respects interruption and input preferences`. The tests must establish these observable assertions:

```ts
await page.goto('/design/');
await expect(page.getByRole('heading', { name: 'Experience reference' })).toBeVisible();
await expect(page.getByText('Design reference — no transaction', { exact: true })).toBeVisible();
await page.getByLabel('Inspect state').selectOption('confirmed');
await expect(page.getByRole('status')).toHaveText('Payment confirmed');
await page.getByLabel('Inspect state').selectOption('unknown');
await expect(page.getByRole('status')).toHaveText('Checking transaction status');
await expect(page.getByRole('button', { name: /send|approve|pay|retry payment/i })).toHaveCount(0);
```

Also assert camera/microphone permissions remain `prompt`, no write requests occur, and requests go only to the page origin. Before/after a state selection, measure the labelled `Amount`, `Asset`, `Recipient`, `Network` and `Approval policy` specimen regions: their positions must change by no more than 1px. Their values remain visibly template labels, not invented transactions. With the native select focused, ArrowDown changes status immediately and starts no motion. Check actual computed foreground/background colors on normal text, badges, primary controls and focus indicators against the stated contrast minima; do not just compare CSS strings to a second list of tokens.

For artwork, click Replay twice 80ms apart and assert at most one animation per moving layer, the control remains enabled, and all motion finishes within 800ms after the final click. Under `page.emulateMedia({ reducedMotion: 'reduce' })`, assert no running transform animation and complete artwork. Bring a second real browser page to the foreground to exercise the hidden-tab cleanup, then return; no old animation may resume. Do not replace visibility APIs or media APIs with stubs.

- [x] **Step 2: Observe the missing-feature failures.** Run `npm run test:browser --prefix web -- --grep "reference|state inspection|semantic controls|motion respects"`. Expected: failures on the absent reference heading/controls, not a broken server or missing browser.

- [x] **Step 3: Implement the foundations and reference page.** Add the exact spec tokens, CSS primitives and typed components. Keep CSS canonical and export the same approved values as JSON for tools. Download Inter and Newsreader from their official sources, preserve their license files, and serve local files with swap and fallbacks. Export original SVG artwork and usage metadata; do not redistribute reference screenshots/video. Animate at most two artwork layers through CSS/WAAPI using the spec's 560ms explanation and 220ms annotation timing; cancel in-flight handles on replay, page hide, preference change and unmount. Use transform/opacity, not animated layout/shadows/blur; avoid a React render each frame. Keep keyboard-triggered changes immediate. The reference's state selector must never run a timed payment story or request media. Use ordinary visible fields and native controls instead of new overlay/gesture infrastructure.

- [x] **Step 4: Verify the actual deliverable.** Rerun the new browser checks plus `npm test --prefix web`, `npm run typecheck --prefix web`, and `npm run build --prefix web`. Inspect the reference on mobile/laptop, status changes, replay interruption and reduced motion. Confirm the existing root readiness still works. If checks fail, diagnose before changing behavior; add a failing regression before a fix.

- [x] **Step 5: Commit the coherent foundation.** Stage the new design sources, tests, original assets, font licenses and touched entry/styles; commit `feat: add accessible treasury design system and reference`. Do not commit captured media, browser reports or generated build output.

## Task 2: Responsive landing and real readiness integration

**Files:** Create LandingPage, complete routes, static-route build script/test and manual/usage documentation; modify main, App styles/metadata, package build command, existing device tests and README.

**Interfaces:**
- Consumes Task 1's Button, ActionLink, StatusBadge and SharedFrame.
- Final `renderRoute(pathname: string): ReactNode`: `/` → landing; `/device-check` (with/without trailing slash) → existing readiness App; `/design` → ExperienceReference; other paths → a clear not-found view and home link. Links use ordinary document navigation; no new client router.
- `writeRoutePages(distDirectory: string): Promise<void>` exported by `web/scripts/create-route-pages.mjs` copies built `index.html` to `device-check/index.html` and `design/index.html`; direct invocation runs it after Vite. It must reject a missing source file. Assets retain root-absolute URLs. Existing Sites project and private audience remain unchanged.
- Document exact paths and asset/component usage. No plan step introduces an executable payment interface.

- [x] **Step 1: Write failing routing, readiness and layout tests.** Add `landing links to real readiness`, `direct entry and history clear readiness state`, `layouts reflow with long reference content`, and a Node test `built routes contain the same entry document`. Retarget the four existing media tests from `/` to `/device-check/`, then verify they still exercise native browser behavior.

For landing, assert the exact approved headline “One decision. Made together.”, the research-stage label and a primary “Check your device” link whose destination is `/device-check/`. Follow the link and assert the actual Start camera/Start microphone/Play test tone controls and initial `0 of 3 checks confirmed`. The how-it-works link reaches the planned-workflow explanation, with no claim that object access or payments already work.

For history/cleanup, start the real speaker tone, navigate immediately to `/design/` via the normal page link, then navigate back. Expect fresh idle readiness and no audibility confirmation from an old session. Separately confirm a played tone, leave, and return: completion must reset. Do not inject successful capture responses; live camera/mic navigation cleanup also remains on the physical checklist.

Run landing, reference and readiness at widths `[320, 390, 768, 1024, 1440]`, including 320px reflow for a 640px layout at 200% zoom equivalent. At each width assert `document.documentElement.scrollWidth <= window.innerWidth` and visible control targets at least 44 × 44px. The reference provides an explicitly labelled `Long content` mode using `?content=long`, containing a 64-character account identifier and long recipient/policy labels; assert full text remains available and the page does not overflow. This is catalogue test content, never a live treasury record. Keyboard traversal must visibly focus actionable elements, with no sensor activation on focus. Verify zoom is not disabled in viewport metadata.

For static routes, use a real temporary directory containing an entry document referencing `/assets/app.js`. Call `writeRoutePages(tempDirectory)` and assert both route files equal that document byte-for-byte and asset URLs remain root-absolute. Assert missing entry fails clearly. This exercises actual file output, not a mocked filesystem.

- [x] **Step 2: Observe failures.** Run `npm test --prefix web` and `npm run test:browser --prefix web`. Expected new failures on absent landing/routing/build behavior. Preserve evidence of the original media tests' genuine failures if a regression appears; do not relax assertions to make a new route pass.

- [x] **Step 3: Implement landing, route entry pages and readiness styling.** Use the approved composition, copy and original assets. Apply semantic foundations to the existing readiness cards; avoid changing the controller. Add links to home and design reference. Maintain actual live camera/input states and explicit audible confirmation. Use 16px+ inputs, safe-area viewport/padding, content that scrolls naturally, pointer-gated hover and immediate press feedback. The final consenting vote may auto-execute in a future treasury adapter: no UI specimen or copy should assume a second Release button always exists. Keep object/audio security limits easy to find and separate design specimens from the working check.

- [x] **Step 4: Verify source, build and hosted routes.** Run `npm run check --prefix web` (unit/browser/typecheck/build), then serve the emitted build with an actual static server and open `/`, `/device-check/` and `/design/` directly in a fresh browser context. Reload each route and verify all local fonts/assets return successfully. Capture laptop/mobile views; inspect at normal and 4× motion duration without committing recordings. Confirm no page errors or unexpected external runtime requests. Record phone-only checks as pending. Inspect actual button/focus colors and text rather than assuming the token definition proves use.

- [x] **Step 5: Document and commit.** Write `docs/design/experience-system.md` with imports, semantic colors, component signatures, original asset usage and motion rules. Write `docs/testing/feature-ui-experience.md` with phone/laptop steps, keyboard/reduced-motion/replay checks, real sensor/navigation checks and links to pending Feature 01 acceptance. Update README with all routes, verified commands, current limitations and track-evidence document. Commit `feat: add responsive landing and integrate device readiness` after passing checks.

## Release and human acceptance

- [x] Read verification-before-completion and the applicable Emil/React review guidance. Have one fresh independent reviewer inspect the whole branch against the approved spec, this plan and media lifecycle constraints. Resolve material findings with test-first changes and rerun relevant checks. No blocking findings; two minor follow-ups are recorded in the release review.
- [ ] Keep cohesive phase commits local for now. The user will select a name and provide a new shared repository after testing; push a feature branch there when provided. Do not push/update the previous GitHub repository or merge the readiness PR. No workflow permission expansion is necessary.
- [x] Package the verified web source/build for the existing private Sites project; deploy privately and verify success. Do not create a second site or make the repository public. Hosted route verification is recorded in the release evidence.
- [ ] Verify the three hosted routes in the owner's authenticated browser. The isolated automated browser received the private access gate (HTTP 401); all three routes passed direct entry/reload on the local static build. This check joins manual acceptance.
- [x] Give the user the working preview and manual checklist. Pause further functional features for their physical-device results. Do not claim phone touch feel, sensor reliability, object matching, acoustic security or NEAR payment behavior from desktop browser tests.

## Track acceptance is a later functional milestone

The approved UI alone does not satisfy the three tracks. The linked track-evidence roadmap specifies actual treasury/policy/vote/receipt evidence for Social Money; connected object/acoustic experiments and failure evaluation for Open Innovation; and a reconciled business invoice, accounting export and scoped sponsorship for Real-World Money. The normal NEAR testnet path is separate from optional 1Click mainnet settlement. No bounty/reputation/inheritance subsystem is added to this UI plan.

## Plan self-review

- Spec coverage: foundations/assets/type/reference/motion in Task 1; landing/mobile/readiness/static routing/docs in Task 2; code review/private preview/manual acceptance in release.
- Review focus: direct route output and reload in Task 2; real navigation/history reset in Task 2; replay/visibility/preference changes in Task 1; keyboard/contrast in Task 1 and layout/focus in Task 2; long content/reflow in Task 2.
- Interfaces: Task 2 consumes the named primitives and SharedFrame; the final route table and artifact paths agree. Catalogue state remains a design-only type and is not reused as a payment controller.
- Scope: no new backend, multisig, inference service, acoustic transport, wallet integration or mainnet spend. Each later functional milestone needs its own design and test plan.
