# Context 2 — compute-intensive engines and security architecture

Updated: 2026-11-13. Owner: the other contributor. Companion lane: [Context 1](CONTEXT_1.md), owned by the user/current session. Read AGENTS.md and both files before starting. This is the harder engine/authority half of the same product, not a separate app or a replacement UI.

## Mission and non-negotiable boundaries

Provide the evaluated vision engine, reliable acoustic exchange and authoritative NEAR account/treasury/payment foundation that Context 1 integrates. The lead audience is teams approving shared treasury payments together. Keep ordinary personal objects and acoustic participation central, with built-in device hardware only. No external NFC/tag/key hardware, no GPS, and no mandatory passkey added to the user's object-only research choice.

An ordinary photographed object is not a high-entropy signing secret. A browser cannot establish trusted sensor input by asserting that a capture is fresh. Sound can be relayed, and multiple devices need not mean distinct people. Preserve these limits in architecture and claims. Research may conclude that an object is unsuitable or that a promised security property is not attainable; show the evidence rather than manufacture a threshold or proof.

## What already exists — do not rebuild it

- [x] Native camera/microphone/speaker readiness and basic responsive app skeleton.
- [x] Three-view local object capture, IndexedDB visual-template lifecycle, fresh-scan numeric comparison and connected navigation.
- [x] Real pinned DINOv2-small q8/WASM baseline through Transformers.js 4.3.2. Current worker is single-thread WASM; WebGPU is not an implemented fallback. Read the exact artifact/schema manifest before comparing engines.
- [x] Baseline fixture integration and production tests; latest full suite 17 unit / 36 browser tests plus type/build/production smoke. Four important reviewed cancellation/recovery issues fixed.
- [ ] Full physical Feature 2 acceptance. Automated Chrome could not access the camera. This remains Context 1's user checkpoint.
- [ ] Calibrated instance authorization, liveness/spoof resistance, cryptographic object access, cross-device recovery, acoustic data transport, NEAR accounts, treasury policy and payout. None is implemented by the existing registration feature.

The existing tiny Objectron test sample separates views within one recording, not independent sessions; distractor backgrounds differ. Its scores and ~0.46-second laptop inference are integration observations, not general accuracy/performance guarantees. Do not inherit an authorization threshold from them. [Current evidence](docs/testing/feature-02-object-registration.md).

## Your exclusive implementation backlog

### A. Evaluated instance-recognition engine — higher compute/reasoning

- [ ] Build a consented, reproducible capture/evaluation protocol with separate enrollment, development/calibration and held-out sessions. Include phone/laptop variance, lighting, angles, crop/background changes, wrong categories, similar instances, identical-model objects and lost/damaged objects. Never commit private captures; retain consent/provenance and reproducible public computational fixtures where licensed.
- [ ] Establish DINOv2-small baseline error distributions and cold/warm p50/p95 timings, memory, download size and failure rates on target devices. Scores alone are not accuracy. Report genuine acceptance/rejection and wrong-object acceptance counts with denominators and uncertainty when thresholds are evaluated.
- [ ] Benchmark DINOv3-small as a challenger and local-feature matching/LightGlue or foreground isolation where global descriptors confuse instances. These are candidate experiments, not approved installed dependencies or guaranteed improvements. Verify current artifact/license/runtime support before selecting them. Keep the existing baseline until measured improvement justifies cost.
- [ ] Evaluate quantization/numerical compatibility, model reuse, caching, WASM/WebGPU and worker behavior. Never silently compare embeddings from incompatible schemas or substitute a different runtime/model. Keep deployment file sizes within hosting limits; do not change the application dependency lockfile concurrently with Context 1.
- [ ] Research explicit fresh-view/rotation challenges using supported built-in sensors; test screens, prints, prerecorded video, descriptor reuse and manipulated clients. Distinguish a usability prompt from trusted liveness. Desktop must not depend on phone accelerometers or torch support.
- [ ] Return an evidence-backed accept/retry/reject policy only if held-out data supports it, including unsuitable-object rejection and known attacks. No universal safety threshold or production identity guarantee. Context 1 currently reports scores only and must not enable access automatically when you deliver a faster extractor.

### B. Object-only research access, key custody and recovery — security-critical

- [ ] Write a concrete threat/custody/recovery design before implementing signing. Explain where random cryptographic keys originate, who can use/decrypt/recover them, what is stored, what the verifier trusts and what happens after object loss or browser-data deletion.
- [ ] Compare software-only custody/attestation approaches compatible with the object-only research choice. Explicitly identify trusted services, compromised-client risks, photo/template theft, rate limiting, revocation and availability trade-offs. Do not derive a NEAR private key by hashing an embedding or use a client “matched” flag as authorization.
- [ ] Get the consequential custody/recovery/security trade-offs reviewed with the user. A handoff file is not approval of an unspecified security architecture, mandatory hardware, passkeys or mainnet funding.
- [ ] Implement the chosen research signer/account adapter against real NEAR testnet. Test unauthorized requests, replay, malformed signatures, recovery/revocation, wrong network/account and concurrent operations. No sensitive material in logs/Git/client metadata. Cross-device access is a separate designed capability, not something local IndexedDB already supports.

### C. Reliable acoustic engine and session verifier — DSP/protocol work

- [ ] Benchmark **ggwave** as the first candidate; no codec is currently installed. Verify the precise browser build/protocol and license. Measure device-pair success, retries, p50/p95 complete-session latency, sample rates, clipping, noise, browser processing and suspension. A software encode/decode roundtrip is not a physical audio channel test.
- [ ] Near-ultrasonic modes are device-dependent and may be audible. Detect unsupported paths and fail visibly; an audible alternative needs an explicit product policy and choice. Consider a different codec/custom chirp or OFDM only after a measured limitation justifies the additional implementation/testing cost.
- [ ] Define a short fresh challenge identifier and authoritative session record bound to network, treasury, proposal ID/content hash, required participants, nonce and expiry. Keep larger signed responses on the authenticated ordinary channel. A codec is neither encryption nor consent.
- [ ] Implement identity-bound two-way exchange, serialized participant turns/collision handling, bounded retries, abort/resume rules and stale-message rejection. Differentiate insufficient signal, timeout, cancellation and invalid payload. Own low-level audio/DSP resources and a clear dispose/cancel API; Context 1 calls it from its screens.
- [ ] Implement/test verifier semantics for replay, expiry, changed proposal/amount/participants, wrong signer, duplicate response, prerecorded audio, live relay and multiple devices owned by one person. Sound exchange is communication evidence; do not claim a guaranteed room boundary or distance bound without evidence.

### D. NEAR authority, treasury policy and settlement — contracts/backend work

- [ ] Assess one real existing treasury integration first (Sputnik testnet and actual deployment/version/policy; assess Trezu compatibility separately). Prefer reuse where it meets the actual policy. Do not assume a hinted protocol or sample hackathon product is mandatory.
- [ ] Define the demo's member/threshold/presence policy explicitly. Unanimous signatures, 2-of-3 signatures and all-three acoustic participation are different policies. Context 1 displays your authoritative policy; it must not invent one.
- [ ] Resolve enforcement: another client can bypass a frontend acoustic gate. If protected payout requires participation attestation, bind a trustworthy attestation/authorization path to enforceable NEAR policy and test every alternate spending/membership/recovery path. A custom gate/contract is an intentional architecture choice, not a track requirement. Do not label optional client ceremony as mandatory on-chain security.
- [ ] Implement real treasury/proposal/policy operations, exact integer amounts, role/membership rules, independent approvals and execution against testnet. Handle asynchronous contract outcomes, insufficient approvals/funds, changed membership, unauthorized/duplicate votes, expiry and repeated execution.
- [ ] Implement authoritative reconciliation after RPC timeout, retries or reload: unknown outcome must not trigger duplicate payment. Verify execution receipts and receiver balance changes, including failure/refund where applicable. Return structured states for Context 1; never substitute “request submitted” for “payment settled.”
- [ ] If gas sponsorship is included, constrain allowed targets/methods/actions, signer, nonce/expiry, gas/deposit and budget. Gas sponsorship does not automatically fund bonds, storage or deposits. No new mainnet spend without exact approval.
- [ ] Supply invoice-to-proposal-to-settlement linkage and canonical receipt fields. Context 1 owns invoice entry, receipt rendering and safe CSV formatting; you own settlement correctness and backend records.
- [ ] Optional later: escrow state/release/refund policy and cross-chain settlement/Chain Signatures/Intents. Do not make these core-demo dependencies. Prior research found no Intents testnet; reverify current official support before choosing an implementation. A dry quote is never a payout, and a completed mainnet path requires separately authorized funds.

### E. Evidence and hardening

- [ ] Contract/backend/engine tests with real integrations; property/invariant tests where meaningful for nonce, policy, replay and execution state. Record observed failures and your coverage limits.
- [ ] Reproducible sensor/recognition/device benchmarks and adversarial test reports. Keep model weights reproducibly fetchable and pinned, not committed binary blobs. No private captures, signing material or generated test reports in Git.
- [ ] Provide a security/limitations review and exact testnet deployment details. A self-review or green test suite is not a security audit.
- [ ] Deliver one complete proposal-bound testnet approval/payment path before optional model upgrades or cross-chain work. Do not spend the whole hackathon on an unintegrated research engine.

## Boundaries and handoff contracts

You own new `contracts/`, `services/`, `web/src/engines/`, engine evaluation scripts and engine/security documentation. These are ownership reservations, not existing implemented modules. Do not rewrite React screens, readiness, the local object store/controller, routing or design assets. Existing baseline worker/client/manifest files remain owned by Context 1 until a reviewed transfer; build a replacement behind an agreed adapter rather than modifying the same files in parallel.

Before substantial implementation, publish small versioned interface proposals in your PR; Context 1 reviews them. The following are integration requirements, not implemented endpoints:

| Boundary | Minimum shared contract |
|---|---|
| Vision | Async extraction/comparison with cancellation, exact model/preprocessor/schema identity, quality/retry errors and measured timing. Current baseline returns 384 normalized values; incompatible revisions require explicit re-enrollment. Do not add authentication semantics to a vector-returning adapter. |
| Account/access | Network/account identity, explicit signer/custody boundary, authorization result, recovery/revocation state and typed failures; never expose a secret key through UI status data. |
| Acoustic/session | Create/start/listen/cancel/dispose; bound session/proposal identity, participant progress, expiry and typed terminal outcomes. Decoded bytes cannot directly cast a vote. |
| Treasury | Read authoritative policy/members/balances; create/read proposal; independently authorize/approve; execute/reconcile. Bind network, account/treasury IDs, proposal content and nonce. Amounts use atomic-unit strings, not floating-point currency. |
| Receipt | Version, network, treasury/proposal/invoice IDs, recipient, asset/decimals, atomic amount, state, timestamps and transaction evidence. Include pending/unknown/failed/refunded states where supported. |

Agree lifecycle/error semantics and one real integration test before either lane builds against a new boundary. Never hand over hardcoded success adapters as if the engine were finished. Separate services/contracts may own their own manifests; coordinate root web package/lockfile changes through Context 1.

## Priority and Git protocol

1. Read current evidence and agree custody/account + treasury interfaces; unblock the smallest real testnet path.
2. In parallel within this lane, establish measured vision/acoustic baselines. Do not enable an uncalibrated access rule.
3. Deliver enforcement/attestation and real acoustic session integration, then payment reconciliation and the business-invoice path.
4. Harden and measure; only then pursue optional heavier model/codec/cross-chain extensions.

Start from the commit containing this context pair on `feat/object-registration` (or its reviewed merge into main), not an assumed newer main. Use your own branch, e.g. `feat/engines-security`, and isolated workspace. Open small PRs by engine or contract; do not force-push shared history or merge without review. Context 1 coordinates root web dependencies and integrated releases. Keep your checkboxes current in Context 2; do not mark UI integration or physical acceptance complete on the other lane's behalf.

Each independently testable engine milestone has automated evidence and a physical/manual checkpoint where required. Context 1's Feature 2 manual gate remains in force for the app journey; isolated research and backend work may progress concurrently under this new two-lane split. New consequential security choices still follow the project's design/review process.

## Track responsibilities and definition of done

Social Money: your real treasury policy, independent authorization and payout underpin Context 1's team experience. Open Innovation: measured object/acoustic behavior and limits connected to that NEAR proposal. Real-World Money: canonical invoice payment and reconciliation underpin the UI's receipt/CSV; it remains conditional until the complete flow works. Context 1 owns final rule rechecks and submission narrative; neither lane independently promises organizer acceptance or publishes a submission.

Your lane is done when its agreed APIs run on real engines/testnet, failure/security tests and device measurements are documented, deployment/provenance is reproducible, and Context 1 can integrate the complete payout flow without fabricating any successful state. Integration acceptance is shared; code ownership stays separate.
