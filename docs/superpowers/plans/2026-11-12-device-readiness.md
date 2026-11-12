# Device Readiness Implementation Plan

> **For agentic workers:** Use the Superpowers executing-plans workflow for native execution in this session, with a fresh reviewer before the final feature handoff. Steps use checkbox syntax for tracking. Follow the user's feature-by-feature manual test gate.

**Goal:** Ship one real device-readiness screen and stop for manual phone/laptop testing.

**Architecture:** React renders independent camera, microphone, and speaker check cards. A browser-media controller owns all streams/audio resources, handles cancellation, and publishes observable state. Pure error and level helpers are tested without mocks; integration tests run against a real browser without fake media or injected successful API responses.

**Tech Stack:** Vite, TypeScript, React, Node test runner, Playwright, native MediaDevices/Web Audio. Pin resolved package versions and commit the lockfile.

**Spec:** [Approved design](../specs/2026-11-12-device-readiness-design.md).

## Global constraints

- One feature checkpoint only. No wallet, object recognition, proximity claim, or payment simulation.
- Neutral label “Team Treasury” until a name is selected.
- Built-in device capabilities only. No external hardware or geolocation.
- No capture upload or persistent capture storage. Sensor data stays in memory.
- Camera/microphone start only on user action, require a secure context, and support stop/retry/reset.
- Do not count an unheard tone, pending permission, denial, or unsupported API as a pass.
- All owned media/audio resources must be released on reset/cancellation/page exit, including late permission results.
- Private GitHub development repository; cohesive phase commits; user manual testing before Feature 02.
- User's “no mocks” rule: browser tests must not use fake capture flags, API stubs, synthetic streams, or mocked success. Permission denial may be exercised using the browser's actual permission controls. Physical success remains a manual test requirement.

## Review focus

1. Stop while permission is pending: late streams are stopped, never attached.
2. Camera/microphone unsupported or denied: actionable state, retry available, no fake success.
3. Speaker audio succeeds but user hears nothing: only explicit confirmation completes this check.
4. Reset/page exit: release real resources and clear the captured frame.
5. Small viewport, keyboard access, no automatic permission prompts or uploads.

## Files and interfaces

- `web/package.json`, `web/package-lock.json`, `web/tsconfig.json`, `web/vite.config.ts`: pinned application/toolchain and build configuration.
- `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles.css`: responsive UI and entry point.
- `web/src/device-check.ts`: `CheckState` and browser-media controller; streams stay inside this owner, UI subscribes to changes.
- `web/src/media-utils.ts`: `classifyMediaError(error: unknown): {kind: string; message: string}` and `rmsLevel(samples: Float32Array): number`.
- `web/tests/media-utils.test.ts`: real helper behavior using literal errors and sample arrays.
- `web/tests/device-check.spec.ts`, `web/playwright.config.ts`: running-browser checks and layout/denial/reset tests.
- `docs/testing/feature-01-device-readiness.md`: manual device checklist and verified/unverified results.
- `.github/workflows/checks.yml`: clean install, typecheck, tests, and production build.
- `README.md`: setup commands, current checkpoint, and manual-test link.

## Task 1: Foundation and tested media behavior

- [ ] Create the Vite/React/TypeScript configuration and dependency lockfile; keep app source in `web/`.
- [ ] Write failing helper tests: denied permission, missing device, busy device, unknown errors; RMS of silence is `0`, constant `0.5` is `0.5`, and alternating `-1, 1` is `1`.
- [ ] Run `npm test --prefix web`; observe missing behavior failing before implementation.
- [ ] Implement the helpers, keeping messages actionable and finite level values.
- [ ] Run helper tests and typecheck; commit the cohesive foundation plus tested primitives.

## Task 2: Real browser feature and release

- [ ] Write browser assertions before implementing the screen: no automatic sensor start, visible idle checks, no overflow at 390px, real browser-denied capture has a retryable error, real Web Audio playback still requires user audibility confirmation, reset returns checks to idle.
- [ ] Run browser tests against the minimal entry point and observe expected missing-feature failures.
- [ ] Implement browser-media ownership with per-check cancellation generations and state. Start/stop camera and microphone independently; use an analyser for measured level and an oscillator for a short audible tone. Camera capture draws a real frame to a canvas, held in memory only.
- [ ] Implement the three cards, explicit statuses, accessibility, and responsive styling.
- [ ] Run all tests, typecheck, and production build; inspect a live browser at desktop and phone sizes.
- [ ] Review resource cleanup, pending-permission cancellation, stale async completion, reset, error handling, and data retention. Add test-first regressions for findings that automated tests can exercise without fake media.
- [ ] Record actual results and physical-device limits; update README/manual checklist.
- [ ] Commit/push the feature branch and open a draft PR. Keep manual acceptance pending.
- [ ] Provide the user a working preview, test steps, and the draft PR; wait for their results before Feature 02.

## Verification commands

`npm ci --prefix web`, `npm test --prefix web`, `npm run typecheck --prefix web`, `npm run test:browser --prefix web`, `npm run build --prefix web`.

Passing automated checks cannot substitute for physically seeing a real camera feed, observing live microphone input, hearing the tone, or checking operating-system permission indicators. Report those as pending until the user verifies them.
