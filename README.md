# Team Treasury (working name, repository: Accoryn)

A NEAR testnet treasury for small teams. A shared payment is approved together in a meeting:
1. Each member has an app-made NEAR account, unlocked locally with a personal object.
2. One device broadcasts a short challenge by sound.
3. Members who heard it attest from their own accounts.
4. A ceremony gate contract approves the transfer in the team's Sputnik DAO only when enough members attended for that amount.

Built for NEAR HACKATHON (development ends 2026-11-14T23:59Z). Testnet only.

## What works today

| Area | Status |
|---|---|
| Device checks (`/`, `/device-check/`) | Real camera, microphone and speaker checks |
| Object registration (`/object-registration/`) | Three-view capture, local DINOv2 inference, local template, similarity scores. No unlock threshold yet |
| Invoice drafts (`/workspace/`) | Exact amounts, review, local storage, CSV formatting. NEAR actions are **disabled** until the engines are bound |
| Acoustic check lab (`/acoustic-check/`) | Real sound exchange of a fresh 20-character ceremony challenge between two devices |
| Ceremony gate contract | Live on testnet at [`ceremony-gate-v1.accoryn.testnet`](https://testnet.nearblocks.io/address/ceremony-gate-v1.accoryn.testnet); it is the only account allowed to approve transfers in gated DAOs |
| Engines (`web/src/engines/`) | Ceremony crypto, ggwave modem, Sputnik policy/parsing, settlement verification, RPC client, keystore, app-made accounts, transaction journal |
| Not yet | Engines wired into the workspace screens; public board; two-device acceptance; locking the gate's developer key |

**How NEAR is used:**
- The Sputnik DAO holds the funds and the policy.
- The gate contract enforces amount tiers and the meeting attestation on-chain.
- Settlement is read back from the chain, never assumed.

**Verified on testnet** (proposal → session → two attestations → gate vote → exactly 0.05 NEAR paid): see [docs/deployment/testnet.md](docs/deployment/testnet.md).

## Run it locally

Requires Node.js 22.18+ and Chrome. The contract work also needs Rust (pinned by `contracts/ceremony-gate/rust-toolchain.toml`), the `wasm32-unknown-unknown` target and `cargo-near` 0.22.0.

```sh
npm ci --prefix web
npm run dev --prefix web       # http://127.0.0.1:5173/
npm run dev:lan --prefix web   # HTTPS on your LAN (self-signed) so phones can use camera/microphone
```

| Route | Do | Expect |
|---|---|---|
| `/device-check/` | Start each check | Live camera preview, microphone level, speaker tone confirmation |
| `/object-registration/` | Capture three views, save, compare | Similarity scores; nothing uploaded |
| `/workspace/` | Draft an invoice | Exact totals and review; NEAR actions are shown as unavailable |
| `/acoustic-check/` | Broadcast on one device, listen on another | Matching check codes within about 2–6 s |

## Tests

```sh
npm run check --prefix web    # 168 unit tests (2 live ones skipped), browser tests, build, production smoke
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
