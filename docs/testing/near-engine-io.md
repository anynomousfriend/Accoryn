# NEAR engine I/O — RPC, keystore, app-made accounts, transaction journal

Date: 2026-11-13. Engine-layer modules in `web/src/engines/near/` (`rpc.ts`, `keystore.ts`, `account.ts`, `txjournal.ts`, `idb.ts`). Testnet only. No React screen, route or `getAppServices()` binding uses them yet, so there is nothing for an app user to test until the integration lane connects them.

## Acceptance checklist

- [x] RPC client: ordered fallback (fastnear, then near.org; archival for old lookups), per-request timeout combined with the caller's AbortSignal, typed `RpcUnavailableError` / `RpcRequestError`. Uses `fetch` only.
- [x] `viewAccessKey` returns null for both the legacy `result.error` shape and `UNKNOWN_ACCESS_KEY`; refuses nonces that JSON cannot represent exactly.
- [x] `txStatus` returns null only when primary and archival both report `UNKNOWN_TRANSACTION`; an unreachable archival endpoint is an outage.
- [x] Keystore: one pending ed25519 full-access key per account in IndexedDB `accoryn-engine-keys-v1`; `list()`/`get()` never carry the secret; `signerFor()` is the only exit; `markActive()` requires the chain to show the key as FullAccess; corrupted records are reported unusable and left unchanged.
- [x] Account names: `label.testnet`, label 2–32 of `a-z0-9` with single `-`/`_` separators.
- [x] Helper creation: idempotent (our key already on chain = created, no helper call), HTTP errors re-checked on chain, someone else's key = taken, 4xx with nothing on chain = rejected, otherwise unconfirmed (never assumed failed).
- [x] Sub-account fallback: CreateAccount + Transfer + AddKey(FullAccess) through the journal.
- [x] Journal: record persisted (status `signed`) before broadcast; one transaction per requestId, never re-signed; conflicting reuse refused; per-signer Web Lock `accoryn-signer:<signerId>`; tx hash computed, cross-checked against the signer and every RPC outcome; corrupted records block the request.
- [x] Reconcile: hash lookup, single rebroadcast of identical bytes, `expired` only with nonce or validity-window evidence confirmed on every primary and archival endpoint. Timeouts never become failures.
- [x] Live testnet: journaled transfer final, reconciled final, resubmission creates no second transaction; never-delivered transaction reconciled to `expired` from real RPC evidence.

## Verification record

Commands run in `web/`:

- `npm test`: 168 tests, 166 pass, 2 skipped (the live tests, gated by `ACCORYN_LIVE_TESTNET=1`), 0 fail.
- `npm run typecheck`: clean.
- `npx playwright test tests/near-keystore.spec.ts`: 3 pass (real Chrome IndexedDB, persistence across reload). A deliberate mutation that leaked `secretKey` from `list()` made 2 of the 3 fail, then was reverted.
- `ACCORYN_LIVE_TESTNET=1 node --test tests/near-live-testnet.test.ts`, each test run once against testnet:
  - Journaled 1-yocto transfer `accoryn-carol.testnet` → `accoryn-payee.testnet`: [`4RVCEbNk…`](https://testnet.nearblocks.io/txns/4RVCEbNka2b5ABevicsA7iHmkapmy9C6agX6QGbVfgzJ). FINAL; the journal's hash matched the RPC's; resubmission returned the same hash; payee balance +1 yocto exactly.
  - Never-delivered transaction `6ivQahc1…` (signed, broadcast dropped by the test) and the later transfer that took its nonce, [`D6xCg1mJ…`](https://testnet.nearblocks.io/txns/D6xCg1mJM3vRcqNS2SerD2dEqHbbKYu7SSBZhFGuqcmN). Reconcile reported `expired` / `nonce-consumed` after about 33 s, once the evidence margin had passed. Payee +1 yocto exactly.
- One manual helper run (the only faucet spend): created `accoryn-io-c3c5066d.testnet` (balance exactly 10 NEAR). Re-running it returned `alreadyExisted: true` without calling the helper. That account then funded `sub.accoryn-io-c3c5066d.testnet` with 0.01 NEAR through the journal, [`9WY5L4AL…`](https://testnet.nearblocks.io/txns/9WY5L4ALtwuKUa1XCaByxEhzoJguD7ha368N93EfM1WQ). Reusing the requestId returned the same hash. The run kept its keys only in memory, so both accounts are throwaway.

Node RPC tests use local `node:http` fixtures replaying observed testnet response shapes. Journal state-machine tests use an in-memory chain double (`web/tests/support/chain-double.ts`). Neither is evidence of chain behavior; the live tests are.

## Observed testnet behavior the code depends on (2026-11-13)

- `send_tx` with `wait_until: "NONE"` returns `{"final_execution_status":"NONE"}` **without validating**, even for an already-consumed nonce. With `INCLUDED` it returns `INVALID_TRANSACTION`/`InvalidNonce` within ~300 ms. Reconcile therefore rebroadcasts with `INCLUDED`, and a bare NONE reply is never treated as evidence. (The first live expiry run caught this; the journal was fixed and the chain double now models it.)
- `tx` with any wait other than `NONE` stalls on an unknown hash until a server timeout (HTTP 408 `TIMEOUT_ERROR`, or no answer within 25 s); `NONE` answers `UNKNOWN_TRANSACTION` immediately.
- `view_access_key` and `call_function` failures arrive as HTTP 200 results that carry an `error` string.
- `EXPERIMENTAL_protocol_config` and `EXPERIMENTAL_genesis_config` both report `transaction_validity_period = 86400`.
- The helper accepts browser CORS preflight from `http://127.0.0.1:5173`.

## Disclosed limits

- Secret keys are extractable, unencrypted strings in IndexedDB. Anything that can run script in the origin, or anyone with the unlocked browser profile, can read them. The object scan is not encryption. Clearing site data loses the key; recovery is DAO governance.
- A transaction the network refused at broadcast stays `submitted` (not `failed`): an RPC operator could replay the same bytes while they remain valid. It becomes `expired` once its nonce is consumed by any later transaction from that key, or after the 86400-block (~1 day) validity window. A follow-up could add an explicit same-nonce "supersede" transaction to settle this sooner.
- Expiry evidence assumes each RPC endpoint's `UNKNOWN_TRANSACTION` answer reflects its own reported final head. The 10-block margin and the requirement that every primary and archival endpoint agree reduce, but cannot remove, reliance on RPC honesty and on load-balancer consistency.
- The helper and sub-account flows were checked by one manual run, not by automated tests (they spend funds). Their failure branches (taken, rejected, unconfirmed, failed) are covered only against local fixtures.
- Not verified: the browser CORS POST to the helper from the deployed app origin, Safari/Firefox IndexedDB and Web Locks, and behavior under concurrent tabs beyond the Web Lock design.
