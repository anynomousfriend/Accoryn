# Team Treasury (working name, repository: Accoryn)

A NEAR testnet treasury for small teams. A shared payment is approved together in a meeting:
1. Each member creates an app-made NEAR testnet account after a manually acknowledged object-scan experiment. The scan is not secure authentication.
2. One device broadcasts a short challenge by sound.
3. Members who heard it attest from their own accounts.
4. A ceremony gate contract approves the transfer in the team's Sputnik DAO only when enough members attended for that amount.

Built for NEAR HACKATHON (development ends 2026-11-14T23:59Z). Testnet only.

## What works today

| Area | Status |
|---|---|
| Device checks (`/`, `/device-check/`) | Real camera, microphone and speaker checks |
| Object registration (`/object-registration/`) | Three-view capture, local DINOv2 inference, local template, similarity scores. No unlock threshold yet |
| Connected flow (`/treasury/`) | App-made accounts, vault creation/funding, inline invoices, acoustic member consent, journaled execution, verified receipts and CSV; opt-in testnet writes |
| Read-only board (`/board/?dao=…`) | Real policy, tiers and verified payout evidence without a local key |
| Legacy draft editor (`/workspace/`) | Exact local amounts/review/storage; its v1 service placeholders stay disabled. Use the connected treasury for chain actions |
| Acoustic check lab (`/acoustic-check/`) | Real sound exchange of a fresh 20-character ceremony challenge between two devices |
| Ceremony gate contract | Live on testnet at [`ceremony-gate-v1.accoryn.testnet`](https://testnet.nearblocks.io/address/ceremony-gate-v1.accoryn.testnet); it is the only account allowed to approve transfers in gated DAOs |
| Engines (`web/src/engines/`) | Ceremony crypto, ggwave modem, Sputnik policy/parsing, settlement verification, RPC client, keystore, app-made accounts, transaction journal |
| Not yet | Calibrated object authentication, two-device manual acceptance, production custody, locking the gate’s developer key |

**How NEAR is used:**
- The Sputnik DAO holds the funds and the policy.
- The gate contract enforces amount tiers and the meeting attestation on-chain.
- Settlement is read back from the chain, never assumed.

**Verified on testnet** (proposal → session → two attestations → gate vote → exactly 0.05 NEAR paid): see [docs/deployment/testnet.md](docs/deployment/testnet.md).

## Run it locally

Requires Node.js 22.18+ and Chrome. Using the existing deployed contracts does not require Rust or a wallet extension. Building/testing the contract source also needs Rust (pinned by `contracts/ceremony-gate/rust-toolchain.toml`), the `wasm32-unknown-unknown` target and `cargo-near` 0.22.0.

```sh
npm ci --prefix web
VITE_ENABLE_TESTNET_WRITES=1 npm run dev --prefix web
# Or HTTPS on your LAN (self-signed), needed for phone camera/microphone:
VITE_ENABLE_TESTNET_WRITES=1 npm run dev:lan --prefix web
```

| Route | Do | Expect |
|---|---|---|
| `/device-check/` | Start each check | Live camera preview, microphone level, speaker tone confirmation |
| `/object-registration/` | Capture three views, save, compare | Similarity scores; nothing uploaded |
| `/treasury/` | Continue from a fresh scan acknowledgment | Real testnet account → vault → inline invoice → member sound/consent → verified payout |
| `/board/?dao=…` | Share a treasury account | Read-only chain evidence, with no signing-key access |
| `/workspace/` | Use the older local draft editor | Saved drafts are also available in the connected flow |
| `/acoustic-check/` | Broadcast on one device, listen on another | Matching check codes within about 2–6 s |

Exact manual steps, retry behavior and coverage limits: [connected testnet acceptance](docs/testing/end-to-end-integration.md). The default build is read-only unless `VITE_ENABLE_TESTNET_WRITES=1` is explicitly set. Keys remain unencrypted/extractable in browser IndexedDB; image scores do not protect them.

## Tests

```sh
npm run check --prefix web    # unit tests, browser tests, build, production smoke; live spending is opt-in
cd contracts/ceremony-gate && ./scripts/fetch-sputnik-wasm.sh && cargo test   # 16 unit + 5 sandbox
```

- **Complete local guide**, including live-testnet runs with your own free testnet accounts: [docs/testing/context-two-local.md](docs/testing/context-two-local.md).
- **Physical sound test between two devices:** [docs/testing/acoustic-check-manual.md](docs/testing/acoustic-check-manual.md).
- **Test policy:** tests never inject fake capture devices or fake successful responses. Recorded testnet responses in `web/tests/fixtures/` carry provenance. Software-only audio tests are labelled as such.

## Documentation map

- **Read first:**
  - [AGENTS.md](AGENTS.md)
  - [CONTEXT_1.md](CONTEXT_1.md): the app lane
  - [CONTEXT_2.md](CONTEXT_2.md): the engine/security lane
- **Engine API and integration plan:** [docs/integration/context-two-engines.md](docs/integration/context-two-engines.md).
- **App adapter contract:** [docs/integration/context-one-adapter.md](docs/integration/context-one-adapter.md).
- **Security model and limits:** [docs/security/ceremony-threat-model.md](docs/security/ceremony-threat-model.md).
- **Feature status:** [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md).
- **Tracks and evidence:** [docs/hackathon/track-alignment.md](docs/hackathon/track-alignment.md).

## Limits, stated plainly

- **The object scan is a local convenience unlock.** A photo is not a secret, and app-made keys are stored in the browser.
- **Sound shows that devices communicated, not who is in the room.** A challenge can be relayed live, and one person can control several accounts.
- **Governance can override the ceremony.** G = max(2, N−1) members can change the DAO policy or remove the gate. This is how a lost member is replaced.
- **The gate is still upgradeable.** It still has a developer key until it is locked before submission.

## Engineering rules

- Use real browser and blockchain APIs; label unimplemented behavior clearly.
- No external hardware, NFC, tags, readers or security keys.
- Never commit keys, captures, local certificates, environment secrets or fetched contract binaries.

## Third-party code and tools

- **Libraries:**
  - React, Vite, Tailwind
  - Transformers.js with DINOv2-small
  - near-api-js 7.5.3
  - `@noble/curves` and `@noble/hashes`
  - ggwave 0.4.0, with the modem ported from the owner's earlier Proof-of-vicinity prototype
  - near-sdk 5.29, near-sandbox and near-api, for the contract and its tests
- **Existing NEAR infrastructure:** the Sputnik DAO v2 contract (`sputnikv2.testnet`).
- **AI tools:** AI coding assistants (Claude Code and Codex) were used during development.
