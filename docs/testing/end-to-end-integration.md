# Connected testnet acceptance

This branch adds `/treasury/` and `/board/?dao=…`. The existing `/workspace/` remains the local draft editor with its old, disabled v1 service sections; use the **connected testnet treasury** link for real chain actions. No mainnet is supported.

## Start

```sh
npm ci --prefix web
VITE_ENABLE_TESTNET_WRITES=1 npm run dev:lan --prefix web
```

The dev command verifies/downloads the pinned DINOv2 assets on first use. Open the printed HTTPS LAN address on both devices, on the same Wi-Fi. Accept the local development certificate warning. Camera and microphone access may require trusting that certificate in your device settings. Use the same origin throughout each device's test: localhost and a LAN IP have separate browser storage. Do not clear site data during a pending operation.

For local development with no phone, `VITE_ENABLE_TESTNET_WRITES=1 npm run dev --prefix web` serves http://127.0.0.1:5173. Node and Chrome suffice to use the already-deployed contracts. Rust/cargo-near are only required to build and test the contract source; no new contract deployment or wallet extension is needed.

## What the object step means

Register three views, then perform a fresh scan using the real local DINOv2 model. Inspect the scores, tick the explicit research acknowledgment and continue to the testnet account screen. The handoff lasts ten minutes and refresh/relock requires another scan confirmation. Each financial action still requires a separate click and appropriate on-chain authority.

There is **no validated accept/reject classifier or secure object login**. A pen-versus-bottle result cannot automatically admit or deny a wallet. The acknowledgment is a manual research continuation. It does not protect the unencrypted, extractable signing keys stored in IndexedDB. Never send real/mainnet funds. A new browser/device does not recreate an existing account's key from its object.

## Main manual journey — two devices / two members

- [ ] On each device: `/device-check/` → confirm camera, microphone and speaker → `/object-registration/` → register, fresh scan, acknowledge → continue.
- [ ] Each person creates a different lowercase testnet username. Expect a confirmed chain account and its own locally stored key; record the full `name.testnet` username. The helper normally supplies testnet funds. If it refuses (including HTTP 429), keep the original request/key and retry **Resume original request** later. Reconcile first; do not clear storage or switch names underneath a pending request.
- [ ] The host creates a shared vault with both full usernames, including the host. Creation attaches 6 testnet NEAR. Record the resulting `name.sputnikv2.testnet` account.
- [ ] Load that vault on both devices. Compare members, governance threshold, spendable balance and amount tiers. Fund it with 1 testnet NEAR using **Fund loaded vault**.
- [ ] In the connected screen, choose **New invoice**, fill the vault, recipient, purpose and a positive native NEAR amount (start with 0.05), then save. Review the saved exact amount/recipient/purpose and explicitly submit. Expect a real numbered proposal; the same draft must become locked against another submission.
- [ ] On the other device, load that vault and proposal ID. Both members review the exact proposal. For this release the listeners are vault members; a separate external recipient sound response is deferred.
- [ ] Host chooses **Open host session** (0.1 testnet NEAR deposit). Listener refreshes the payment/session, then taps **Listen to host sound**. Host taps **Play host sound**. Stay on each page, keep the devices awake, and use built-in speakers/microphones at a moderate volume. Audible-fast is explicit; there is no silent ultrasound fallback.
- [ ] After sound exchange, each member separately ticks consent to the exact payment and chooses **Sign member approval**. Sound alone must not approve anything.
- [ ] Refresh payment on the executor device. Before the attendance threshold is met, execution must remain disabled. Once met, an eligible member executes. Expect **settled** only after the exact successful transfer receipt is independently verified.
- [ ] Executor chooses **Publish verified payout evidence**. Open **Load chain receipts**, follow the explorer link, and download CSV. Verify the exact recipient and atomic amount.
- [ ] On a fresh browser/device with no local key, open `/board/?dao=YOUR_VAULT`. Verify the policy and payout from public reads. A gate vote or an unverified evidence pointer must not be presented as a settled payout. The board inspects the latest 50 proposals; it is not a complete archival indexer.

## Recovery / negative cases

- [ ] Stop or reload during a chain action: its original request ID remains. **Reconcile original request** checks that ID and the canonical business outcome. Unknown/pending outcomes block another submission. A definitively failed/expired/not-signed transaction may clear the barrier; no different transaction is silently signed.
- [ ] **Resume original request** retries the same account key or signed transaction. Never use it to change recipient, amount or account. If an open host challenge was lost on reload/hide, cancel the old session and explicitly open a new one; the seed is not recoverable from storage.
- [ ] Hide the page, cancel sound, deny microphone, try unrelated audio, or let the five-minute session expire. No stale sound/consent may authorize an approval. Scan another object and compare the measured results; do not interpret a score as a security guarantee.
- [ ] Reopen a submitted invoice and attempt resubmission. Its stored proposal reference must prevent another submission of that draft. Clearing invoice drafts must not clear pending action records or submitted references.
- [ ] Lock the research session. Signing/account selection requires a new valid scan acknowledgment; read-only lookup stays available.

## Governance / member recovery

These controls are implemented with real transactions. A lost signing key is not recoverable from an image. Create a new account, then have existing governance members approve **Propose complete member update**, listing the complete desired member set. Requestor/Admin roles change together after the governance threshold is met. Load and inspect the full governance proposal before each vote. Never assume a membership proposal has already changed the roster.

**Propose disabling factory automatic upgrades** creates a `FactoryInfoUpdate` proposal. It only takes effect after the required votes and a refreshed authoritative `get_factory_info`. The gate itself still has its developer key; deleting it is deliberately outside this release's authorization. Governance remains an escape hatch and this is a testnet research prototype.

## Automated evidence and limits

A live native Chrome journey on 2026-11-13 created two fresh browser accounts, created/funded `integration-bf7a0112.sputnikv2.testnet`, submitted invoice proposal 0, exchanged an actual laptop speaker/microphone challenge, collected two independent account attestations, executed a 0.05 NEAR payout and verified/published its evidence.

Payout: [EA1nmm93…](https://testnet.nearblocks.io/txns/EA1nmm93YpiqBKy731Rc5Tba87nzrgZgpsqKUf8nCR5A). This is public chain evidence, not a test secret.

That test used real DINOv2 inference over image fixtures and an explicitly consented fixture handoff. It did **not** validate live camera discrimination, spoof resistance, two-device acoustics or distinct humans. A subsequent extended governance run was stopped by the helper's HTTP 429 during fresh account setup, before governance writes. Do not claim those live governance votes were tested in that run.

`npm run check --prefix web` covers unit, browser and packaged production behavior. Live spending is opt-in: `VITE_ENABLE_TESTNET_WRITES=1 ACCORYN_LIVE_APP=1 npm run test:browser --prefix web -- --grep 'real app account'`. Add `ACCORYN_LIVE_GOVERNANCE=1` for the additional hardening/member-change exercise when the faucet permits it. It uses actual device audio and therefore requires physical microphone permission and a quiet room. No browser credentials are exported; generated logs/reports stay ignored.

## Final review verification

After the independent review, the full check passed again: **195 unit tests passed (2 opt-in live tests skipped), 66 browser tests passed (1 opt-in live test skipped), typecheck, build and production smoke passed**. Regression coverage now includes a terminal failed payout (including a stale Executing flag), delayed duplicate-invoice admission in two actual browser tabs, the wrong proposal's otherwise matching successful transfer, altered vote/ceremony IDs, disconnected receipt ancestry, same-vault board retry and changed-code funding. No contract source changed; Rust tests were not rerun in this environment.

Implementation decisions: keep the existing v1 draft editor compatible and put real tiers/ceremony semantics in the dedicated connected adapter; use explicit manual image research confirmation rather than invent an authentication threshold; keep unknown writes bound to original IDs; keep commits local because the existing origin is public; retain unaccepted live governance/device checks rather than label fixtures as end-to-end proof. The planning skill's unavailable bookkeeping scripts were replaced by an ignored local ledger; one independent whole-branch reviewer was used.
