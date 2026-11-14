# Explicit demo object decisions

User decision: replace the inconclusive primary result with a deterministic demo decision. Keep this on `feat/near-tooling-testnet-rate-limit`.

- Use the existing mean of the two highest cosine similarities. Strictly greater than `0.50` gives **Match**; `0.50` or less gives **No match**. Invalid/non-finite or out-of-range values fail closed.
- Display the result prominently with a small Demo label and a similarity score scaled to points out of 100, not an identity probability. Keep raw measurements and a brief uncalibrated-threshold explanation under details.
- Below-threshold scans cannot continue or create a payment-bound object check. The existing two-minute expiry, exact account/vault/payment/session/template binding and signing-time checks remain.
- The rule is a demo heuristic, not evidence that the exact physical object or person has been authenticated. Retain concise truthful limits in details/security documentation; do not claim certainty or resistance to copied objects/stolen keys.

Acceptance: boundary/invalid-score unit tests; low-score grant rejection; real-inference held-out cup versus bottle fixture UI tests; withdrawal/expiry regressions; full unit/browser/build/production checks; manual threshold testing handoff. No new model, backend, contract or custody changes.

Execution: user supplied the exact decision rule; implement natively with failing tests first, then a cohesive local commit. No further design-choice round is needed for this specified change.


## Verification and manual checkpoint

- [x] Strict 0.50 boundary, invalid values, low-score grants and rounded-boundary display covered by unit tests.
- [x] Real local DINOv2 fixture inference: held-out cup produces Match; bottle produces No match, disables continuation and clears the previous check.
- [x] Full unit suite: 213 passed, 2 opt-in skips (215 total). Full browser suite: 78 passed, 2 opt-in skips (80 total).
- [x] Typecheck/build passed. Independent review found no blocker; its boundary-rounding note was fixed and tested.
- [ ] User checks the result with their real camera/object and continues the demo.

Manual steps: refresh the app, compare a fresh scan, read Match/No match, and open View comparison details if needed. After Match, check I reviewed this matched scan and use Use matched scan for this payment. After No match, both controls must be disabled and Scan again remains available. Existing payment-session expiry and audio steps still apply.

Known interpretation limit: the existing similar-but-different cup fixture scores about 0.5073 and therefore also passes this user-selected demo rule. This is a decision-flow change, not a claim that instance-recognition accuracy improved or that a physical object is certainly authenticated.
