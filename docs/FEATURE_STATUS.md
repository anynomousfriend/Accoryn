# Functional feature checkpoints

Visual redesign is paused. The current screens are the working skeleton for implementing and testing real behavior.

## Current release: Feature 1 — device readiness

Open `/` or `/device-check/`. This feature provides native camera preview/frame capture, measured microphone input and real speaker playback with explicit confirmation. It does not enroll an object, create a wallet or move funds.

Automated verification passed: 10 unit tests, 17 real-browser tests, TypeScript and production build. The new home-entry test was observed failing before implementation. Tests use actual browser APIs and actual filesystem route output, without fake media or injected successful responses.

**User testing is pending.** Follow the [manual checklist](testing/feature-01-device-readiness.md) on a phone and laptop. Report device/browser, pass/fail per step and exact errors. Actual camera/mic quality, speaker audibility, OS indicators and mobile permission behavior require this evidence; automated success does not certify perfect operation on every device.

## Delivery rule

1. Implement one functional slice using the basic skeleton.
2. Write meaningful tests before new behavior; run unit/integration and browser end-to-end checks for that slice.
3. Publish a testable release with expected results and precise manual steps.
4. Wait for the user's results; fix failures before the next feature.
5. Return to visuals after the functional milestones are accepted.

Upcoming work includes object enrollment/verification, actual NEAR accounts/treasury integration, acoustic challenge exchange and policy-bound payment/receipt flows. These are not implemented. The next functional milestone does not begin until Feature 1's manual test results arrive.

The final project name/shared repository are still pending. Keep phase commits local until the user provides the new repository; do not push to the prior repository.
