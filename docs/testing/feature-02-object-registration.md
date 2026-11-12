# Feature 02 — object registration and scan comparison

Status: implementation in progress, not released for manual testing yet. No wallet or automatic object authentication is implemented.

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
