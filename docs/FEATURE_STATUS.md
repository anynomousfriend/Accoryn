# Functional feature checkpoints

Visual redesign is paused. The current screens are the working skeleton for implementing and testing real behavior.

## Current release: Feature 1 — device readiness

Open `/` or `/device-check/`. This feature provides native camera preview/frame capture, measured microphone input and real speaker playback with explicit confirmation. It does not enroll an object, create a wallet or move funds.

Automated verification passed: 10 unit tests, 17 real-browser tests, TypeScript and production build. The new home-entry test was observed failing before implementation. Tests use actual browser APIs and actual filesystem route output, without fake media or injected successful responses.

**User confirmed the three device checks on 2026-11-12:** “yes the three device is checked.” Record this as happy-path acceptance of camera, microphone and speaker. No failures were reported. Device/browser versions, coverage on both phone and laptop, and the additional denial/cancellation/lifecycle checks remain unverified. See the [manual checklist](testing/feature-01-device-readiness.md). This feedback permits preparing the next functional feature; it does not certify perfect operation on every device.

## User navigation: current and planned

**Current app:** open `/` → one readiness screen with three independent checks → capture/confirm, retry, stop or reset. Checks can be run in any order. Reaching 3 of 3 ends the current checkpoint; there is no object-registration or account-creation continuation yet.

**Intended connected journey:** device readiness → guided object enrollment → fresh-scan verification → real NEAR testnet account setup → create/join team treasury → propose payment → all required members review the exact proposal → acoustic exchange → explicit independent approvals → actual settlement and receipt.

The sequence beyond readiness is a proposed product flow, not implemented navigation. Object matching must not be described as deriving a safe private key from a photograph. The object-only research access, key custody and recovery design must be explicit before account signing is implemented.

Build each milestone as an extension of the preceding journey. Its browser/integration tests should start from the working app entry and reach the newly completed step, alongside focused failure tests. Do not build disconnected mock screens and call them completed features. Progress updates should say what the user can now navigate from and to.

## Delivery rule

1. Implement one functional slice using the basic skeleton.
2. Write meaningful tests before new behavior; run unit/integration and browser end-to-end checks for that slice.
3. Publish a testable release with expected results and precise manual steps.
4. Wait for the user's results; fix failures before the next feature.
5. Return to visuals after the functional milestones are accepted.

Upcoming work includes object enrollment/verification, actual NEAR accounts/treasury integration, acoustic challenge exchange and policy-bound payment/receipt flows. These are not implemented. Feature 1's happy-path feedback has arrived. The user approved guided local object registration and fresh-scan comparison on 2026-11-12; its [three-task implementation plan](superpowers/plans/2026-11-12-object-registration.md) awaits review before native execution. It reports measured similarity scores and does not unlock an account.

The user supplied the shared repository: [Accoryn](https://github.com/anynomousfriend/Accoryn). Existing history was preserved and pushed to `origin/main`. Use feature branches and reviewed pull requests for subsequent changes. App-wide branding remains a separate decision; visual work is paused.
