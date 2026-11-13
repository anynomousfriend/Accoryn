# Feature 02 — object registration and scan comparison

Status: ready for manual testing locally; independent review fixes verified. Hosted preview publication is tracked separately below. No wallet or automatic object authentication is implemented.

## Real model baseline

DINOv2-small ViT-S/14 through Transformers.js 4.3.2, q8 WASM, one thread in a worker. Immutable source revision `c2bb04a51fab207c420665f1946016107bffc701`. Model weights: 24,451,943 bytes; pinned local runtime assets: 14,289,219 bytes. Exact SHA-256 and processor/config/runtime provenance are in `web/src/object-registration/model-manifest.json`. Model/runtime binaries are prepared reproducibly, ignored by Git and packaged in deployments. No user photos are part of those assets.

Observed initial native Chrome fixture run on the development laptop: local model load ~1,042 ms; scan inference ~459–461 ms. This is one local run, not a phone/network performance guarantee. Similarity aggregate is the mean of the two highest of three cosine scores.

| Probe | Individual scores | Top-two mean |
|---|---|---:|
| Same cup, held-out frame | 0.7115, 0.6849, 0.6221 | 0.6982 |
| Different cup | 0.5348, 0.4799, 0.4318 | 0.5073 |
| Bottle | 0.2117, 0.1516, 0.1666 | 0.1892 |

These are actual Objectron video frames; provenance and computational-use license are in `web/tests/fixtures/vision/README.md`. Held-out means another timestamp in the same clip, not a separate capture session. Different objects have different backgrounds. This tiny sample cannot establish false-acceptance rates, foreground invariance, physical possession or safe access thresholds. The app reports scores without a match/deny decision.

Initial quality heuristics: analyze a 256×256 crop; reject mean luma below 24 or above 235, or Laplacian variance below 20. These reject grossly unusable images, not object identity, screen/print attacks or all blur. Capture is a center square at 512×512; model preprocessing is pinned independently.

## Verification to date

- New crop/vector tests failed on missing modules before implementation, then passed (5 tests); complete unit suite 15/15 at that checkpoint.
- Real browser inference harness failed before the model adapter existed, then passed all 3 tests: actual image inference, immediate worker-load cancellation and a real failed asset request without a successful substitute.
- No fake camera streams, injected successful model responses, image upload or external model/runtime requests were used. The harness is a computational fixture integration test, not a physical camera E2E test.

The final release will add full flow/manual steps, actual final suite counts and remaining limitations before requesting user acceptance.

## Automated release-candidate evidence

`npm run check --prefix web` passed **16 unit tests and 32 browser tests**, TypeScript, production build, and the production smoke runner. The latter runs the emitted worker and packaged model, direct static navigation, fixture-derived native IndexedDB read/delete, cancellation and a blocked model request. It checks for image uploads and external model/runtime traffic; neither occurred. Latest packaged inference was ~454–534 ms per fixture on this laptop, with ~433 ms local model load. All fixtures/harnesses are excluded from the shipped distribution.

A fast-Start race failed a new regression test: existing storage could be bypassed before its initial read completed. Initialization now holds Start disabled until that read finishes; the regression passed. The test server initially returned a root 404 by appending index.html twice; correcting that test-only path allowed actual production verification to run.

Native Chrome physical-camera probing returned `NotAllowedError`, even with browser camera permission granted. No fake stream was substituted. Live capture, quality on personal objects, changing angles, actual phone behavior and physical sensor indicators remain manual. Fixture inference and template seeding do not establish that full camera journey.

## Manual test checklist for the completed release

Use a full browser tab and a non-sensitive textured object. Open the provided HTTPS private preview on a phone, or http://127.0.0.1:5173/ on this laptop. Plain HTTP LAN addresses do not enable phone camera access.

1. From the device screen, finish the three checks and choose **Continue to object registration**. If already checked, choose **Open registration directly**. The new page reads local storage but does not start the camera or download the model automatically.
2. Read the local-storage notice and choose **Start registration**. Wait for real model loading, allow the camera, and fill the square with your object. Keep the lighting even. If access is denied, enable it in browser settings and retry; no registration should be saved after failure.
3. Choose **Capture view**, inspect the still, and **Use this view** or **Retake view**. Repeat for front, slightly left and slightly right. The angle prompts are guidance, not a liveness guarantee. The camera should turn off during still review.
4. After three accepted views, enter a non-sensitive label and choose **Save visual template**. The previews must disappear. A saved label should appear; no wallet or authenticated account should appear.
5. Choose **Compare a fresh scan**, capture it, then **Compare this scan**. Expect three numeric similarities, their top-two mean and measured processing time. Repeat three times with the original object. Record scores and rough timings.
6. Choose **Try another object**. Test a clearly different object and a similar-category item; record their scores, including any overlap with genuine rescans. Optionally test a screen or printed picture as a known attack probe. A score is not a match/deny or physical-possession guarantee.
7. Reload: the saved label remains, camera stays off, and another fresh comparison is possible. A different browser/device should not inherit the registration. Try a replacement and verify it requires explicit confirmation before saving.
8. During model load or capture, choose **Stop and discard unsaved views**, or switch tabs/apps and return. No unsaved previews/camera activity should revive. A previously saved template should remain.
9. Choose **Delete registration**, try **Keep registration**, then confirm deletion with **Yes, delete registration**. Reload: no saved label remains and registration starts fresh.

Report device/browser versions, pass/fail at the failed step, same-object versus wrong-object scores, and loading/inference delays. Do not send personal photos. We wait for these results and fix failures or poor discrimination before adding object-based account access or the next functional feature.

## Known boundaries

One browser/device, one local registration, no cross-device recovery. IndexedDB templates are origin-accessible research data, not a hardware-backed vault. No automatic threshold, wallet keys, NEAR account, acoustic challenge or payment is implemented. Scores do not establish identity or resist replay. Device/browser compatibility and physical capture remain the manual acceptance gate.

## Final review and fresh verification (2026-11-13)

Independent review identified four important lifecycle/recovery issues; all were fixed in one pass. New tests failed before fixes, then passed: canceled initial storage lookup, retained-view save retry, reconciliation of an actually deleted native record before the next action, and stale stream cleanup ownership. Save-retry coverage prepares controller state with real inference-derived fixture vectors; it is not physical capture. Media ownership uses native Web Audio MediaStreams, not a fake camera. No live-camera success is claimed.

Fresh `npm run check --prefix web`: **17 unit tests, 36 browser tests, TypeScript, production build and packaged-model production smoke all passed**. Physical camera remained unavailable to automated Chrome (`NotAllowedError`); the live capture journey awaits your test.

Deferred minor from review: the white visual guide is inset 12 px but the entire square preview is processed. For this checkpoint, fill the whole square preview with the object. The guide boundary will be aligned in a later revision.

Execution decisions: local ledger replaced unavailable skill helper scripts (manual bookkeeping risk); isolated worktree preserved the original checkout (local handoff must use the feature server); Objectron held-out views share a recording session (scores may overstate independent-session performance). No cryptographic/security threshold is inferred from these scores.
