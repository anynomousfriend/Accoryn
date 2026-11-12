# Feature 02: local object registration and scan comparison

Date: 2026-11-12. Status: approved by the user on 2026-11-12; implementation plan review pending. Independent builder check: no important unresolved questions. No model or object-registration code is implemented by this document.

## Intent and scope

Extend the working device-readiness screen into the first real object-registration feature. A team member captures an ordinary personal object, stores a local visual template, and compares a fresh scan against it. This establishes the actual image-processing path and produces evidence for later object-only research access. Keep the existing basic UI; visual redesign remains paused.

The user accepted camera/microphone/speaker happy-path checks. They require built-in device hardware only, one functional feature at a time, automated verification followed by a manual checkpoint, and an eventual connected wallet/treasury journey. They did not authorize a new mandatory passkey or external token.

This slice does not create an account, derive a private key, sign, transfer funds, prove physical-object possession, or unlock anything. Do not display a fake wallet or a successful authentication state. A visual template is potentially sensitive and is not a secret key.

## Approaches and builder calls

The user handed implementation choices to the builder and approved the local-inference/local-template approach below on 2026-11-12.

- **Local inference and local templates (recommended):** photos remain on the device, no image-service credential or backend is required, and each capture uses a real model. Costs: initial model download, browser-dependent latency and no automatic cross-device enrollment.
- **Remote image inference:** easier to use a larger server model, but introduces photo upload, backend availability, retention policy and network latency. Defer because this first functional slice can operate locally.
- **Category recognition or image hashing:** insufficient for comparing a particular object across views. Do not substitute “pen” labels or pixel hashes for an instance-comparison experiment.

Use DINOv2-small ViT-S/14 through a pinned Transformers.js/ONNX artifact as the starting baseline. The converted model card explicitly documents image-feature extraction in Transformers.js. Its availability does not establish object-authentication accuracy. Before implementation chooses exact versions, record runtime version, source revision, model/preprocessor hashes, file sizes and applicable licenses. Test the actual converted artifact; do not silently substitute another model.

Prefer a single WASM worker initially for predictable baseline behavior; WebGPU is a later measured optimization, not a hidden fallback with different numerical behavior. Download/cache model assets only after the user chooses to start registration. Show loading, failure and retry clearly. Host immutable pinned assets with the app, separately from private captures. If hosting size limits prevent this, resolve artifact delivery explicitly before shipping; do not silently fetch a mutable model revision or upload photos.

## Connected flow

```text
/ or /device-check/
  three checks confirmed → Continue to object registration
/object-registration/
  privacy/storage notice → Start → model loading
  camera → front view → slight left view → slight right view
  review / retake → Save visual template
  camera → fresh scan → actual similarity result
  Scan again / Try another object / Delete registration / Back to device checks
```

Readiness remains a diagnostic, not an authorization boundary. The Continue link is enabled at 3 of 3. Direct navigation to object registration is allowed and requests camera permission only after Start; it does not require microphone/speaker permissions for this camera-only task. Returning users can open the same route to compare against a saved template. A saved registration is not an authenticated session.

Only one local object registration is supported initially. Replacing it requires explicit confirmation and must be atomic: a failed replacement leaves the prior record intact. No wallet continuation is shown in this release.

## Capture and inference behavior

- Use the native camera with rear-facing preference on phones and the available camera on laptops. The square guide selects the actual center crop sent to the processor; it is not a background-segmentation claim. Ask users to fill the guide with a distinctive, textured, non-sensitive object on a plain surface.
- Request one view at a time and let the user explicitly capture, review and retake. Do not infer a changed angle from a timer. Tell the user that the prompts guide them; they do not prove a 3D object or prevent screen replay.
- Reject empty/invalid frames, severe darkness/overexposure and gross blur using documented image-quality heuristics. Record exact heuristic values and fixture outcomes during implementation. These checks cannot guarantee foreground detection or object suitability. Do not claim the crop contains the right object.
- Retain captured crops in memory while reviewing. Process the three enrollment crops separately. Normalize the model's pooled/CLS image vector consistently, with finite-value and dimension checks; record preprocessing and embedding schema in the artifact manifest.
- Compare each independent fresh scan to the three saved vectors using cosine similarity. Show all three scores and a clearly labelled aggregate (mean of the two highest), alongside measured inference time. Scores describe visual similarity; they are not probabilities or security confidence.
- This first release reports the real comparison without an uncalibrated match/deny threshold. UI outcome: “Scan compared”, the scores, and “Research comparison — does not unlock an account.” The user tests genuine rescans and wrong objects to determine whether scores separate. Any future automatic acceptance rule requires separate calibration and held-out measurements before object access is enabled.
- Expose capture, processing, saving, comparing, saved, error and canceled states. Disable competing actions while an operation is active and provide cancellation. Use operation IDs to prevent late worker results or permission grants from reviving canceled work.
- Stop camera tracks on leaving the flow, hiding the tab, reset and unmount. Terminate canceled inference and release image resources. Hiding a tab discards unsaved crops; a saved template remains. Return to a stopped state and ask the user to resume; do not auto-reactivate the camera.

## Storage and privacy

Before Save, state: “Save this object's visual template in this browser. Photos are discarded. This does not create a wallet.” Save only the three embeddings, schema/model/preprocessor identifiers, random record ID, user-chosen non-sensitive label and timestamp in IndexedDB. No raw photo, thumbnail, camera stream, private key or biometric metadata is persisted or uploaded. Feature 1's memory-only capture behavior remains unchanged.

Delete registration removes the IndexedDB record and in-memory template/crops/results, then confirms deletion. Clearing browser data also loses registration. Another browser/device does not inherit it. Do not imply cross-device recovery. IndexedDB is origin-accessible storage, not a hardware-backed vault; no cryptographic security claim is made for template storage. No third-party analytics or capture logging.

Handle unavailable storage, quota failure, corrupt/unsupported records, model schema mismatch, download failure, missing camera, denied permission, interrupted capture and inference failure with actionable errors. Never silently overwrite a valid template, migrate incompatible embeddings or display success after failure. Model replacement invalidates comparison compatibility; explicit re-enrollment is required.

## Test and release evidence

Use test-driven development for meaningful state, cancellation, comparison and persistence behavior. Pure mathematical tests may use known vectors; do not present these as model accuracy evidence. No mocked successful media, embeddings, model response or wallet state may stand in for end-to-end integration.

Automated checks must include:

1. Existing readiness regression suite; readiness-to-registration navigation, direct entry, keyboard and mobile-width behavior; no eager camera permission or model loading.
2. Actual model download/load and inference on licensed, provenance-recorded static photo fixtures, including a distinct object and a same-category distractor. Separate development fixtures from held-out images. Check shape, finite values, deterministic score calculation within documented tolerance, actual measured latency, and absence of image uploads. Record scores rather than invent a passing accuracy threshold.
3. Native browser persistence across reload and deletion, atomic replacement failure, incompatible/corrupt template rejection, real model-load failure and permission denial/retry. Use real IndexedDB and the shipped worker/artifacts. Fixtures may be passed to the production inference adapter in integration tests; this is not a simulated live camera capture and must be labelled accordingly.
4. A complete production build with the new direct static route and the pinned artifact manifest. Exercise the shipped bundle, not only development imports.

Automated browser tests cannot establish live-camera object recognition when physical hardware and real object manipulation are unavailable. Do not inject fixture images into getUserMedia or fabricate passing camera success. The release report must distinguish automated app/inference coverage from the following manual complete capture journey.

Manual checkpoint: start from readiness, capture/save three views, rescan the same object three times, try a different-category object and a similar item, reload and compare again, then delete and reload. Report scores and rough latency with device/browser details. Test a screen/print presentation as a known attack case; do not promise rejection. If scores overlap, record the limitation and improve the matcher before building object authorization. Ask the user for these results and wait before the next functional feature.

## Acceptance and failure boundaries

The feature is ready for manual testing when the real capture-to-template-to-comparison path is implemented, its model and storage operations are verified, errors/cancellation cannot manufacture success, and exact manual steps accompany it. It is accepted after the user reports the complete capture flow working; distinguish flow acceptance from evidence of reliable object discrimination. Do not call the current model suitable for wallet authorization merely because integration tests pass. No financial flow may rely on it in this slice.

Builder may choose component/module names, exact quality heuristics after fixture testing, fixtures and packaging mechanics within these constraints. Changes to photo upload, persistent raw images, automatic account unlock, model family or cross-device custody require a revised design.

## Primary sources checked

- [Meta DINOv2 implementation and model family](https://github.com/facebookresearch/dinov2)
- [Xenova/dinov2-small model card and Transformers.js usage](https://huggingface.co/Xenova/dinov2-small)
- [Transformers.js model API](https://huggingface.co/docs/transformers.js/api/models) — use documentation matching the installed stable package, not unpinned main examples.
