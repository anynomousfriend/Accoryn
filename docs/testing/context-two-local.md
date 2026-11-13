# Testing the Context 2 engines on your own machine

**Audience:** the Context 1 contributor and their coding agent.

Every step is "do X → expect Y". Steps 1–4 need no NEAR keys. Steps 5–6 use your own free testnet accounts. Step 7 needs a phone. Expected numbers are from 2026-11-13 on macOS (Apple silicon) with Node 24.12 and Chrome.

## 0. Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js / npm | ≥ 22.18 (we used 24.12 / npm 11.6) | already required by `web/` |
| Google Chrome | current | already required by the browser tests |
| Rust | 1.93.0, pinned by `contracts/ceremony-gate/rust-toolchain.toml` | `rustup` installs it automatically on first `cargo` run |
| wasm target | `wasm32-unknown-unknown` | `rustup target add wasm32-unknown-unknown` |
| cargo-near | **0.22.0** (0.23 needs rustc 1.95) | `cargo install --locked cargo-near@0.22.0` (about 5 min) |
| near CLI (only steps 5–6) | near-cli-rs 0.31 | `npm install -g near-cli-rs@0.31.1` |

```sh
git fetch origin
git switch feat/engines-foundation   # or the merged main once the PR lands
```

## 1. Web app: unit, type, browser, build and production checks

```sh
npm ci --prefix web
npm run check --prefix web
```

**Expect:**
- `ℹ tests 168`, `ℹ pass 166`, `ℹ fail 0`, `ℹ skipped 2`. The 2 skipped are live-testnet tests (step 6).
- Then `57 passed` browser tests (the existing suite plus `acoustic-check.spec.ts` and `near-keystore.spec.ts`).
- The build succeeds.
- `Production smoke passed: real worker/model inference …`.

The first run downloads the DINOv2 model (`prepare:vision`), which needs internet.

**If `npm ci` fails** with `Missing: @emnapi/runtime@2.0.0-beta.2 from lock file`, someone ran `npm install` with npm 11 and it pruned two optional lock entries. Restore them from `main`'s lockfile; see [the engines guide](../integration/context-two-engines.md#pitfalls-already-hit). Do not regenerate the whole lockfile.

**If port 5173 is busy,** stop other dev servers first. Playwright reuses whatever runs on 5173.

## 2. Gate contract: unit and sandbox tests against the real Sputnik code

```sh
cd contracts/ceremony-gate
./scripts/fetch-sputnik-wasm.sh
cargo test
cargo clippy --all-targets -- -D warnings
```

**Expect:**
- **Fetch:** `wrote 539647 bytes, sha256(base58) AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH`. This is the exact DAO code `sputnikv2.testnet` deploys, hash-checked and gitignored.
- **Tests:** `16 passed` (unit), then `5 passed` (sandbox). The sandbox tests start a local NEAR node; allow 1–4 minutes on the first build. They cover:
  - a payout with the exact amount
  - a member's direct approval being denied
  - tier enforcement
  - refusal of non-transfer proposals, with the deposit refunded
  - a member rejecting mid-ceremony
  - the governance escape hatch disabling the gate
  - an underfunded payout reverting, then paying once after funding
  - a `Failed` payout that `Finalize` pays exactly once
- **Clippy:** no warnings.

## 3. Prove the deployed gate is this source

```sh
cargo near build non-reproducible-wasm
python3 -c 'import hashlib;d=open("target/near/ceremony_gate.wasm","rb").read();a="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";n=int.from_bytes(hashlib.sha256(d).digest(),"big");e=""
while n: n,r=divmod(n,58); e=a[r]+e
print(e)'
curl -s https://rpc.testnet.fastnear.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"ceremony-gate-v1.accoryn.testnet"}}' | grep -o '"code_hash":"[^"]*"'
```

**Expect:** both print `6RyhWz4BnSszxQg88ysQnECuFm2KWUXLUrdqVKtTcfBm`.

This held on our machine. The build is not Docker-reproducible, so a different OS or toolchain may produce different bytes. If it does, say so; it is not by itself a failure.

## 4. Read real payouts on testnet (no keys)

Open these links:
- **A full ceremony payout:** https://testnet.nearblocks.io/txns/4NKh8ik6P9a66RfDyUsaVNpbYSPVnBPmjNJwon2swzw5
  **Expect:** the gate calls `act_proposal` on the DAO, and the DAO transfers 0.05 NEAR to `accoryn-payee.testnet`.
- **A member trying to approve directly:** https://testnet.nearblocks.io/txns/243Qb7wwWDtXN6yyAiq6g1fVUjjppLkSpRuCbQ8ACHfB
  **Expect:** `ERR_PERMISSION_DENIED`.

Or query a session directly:
```sh
curl -s https://rpc.testnet.fastnear.com -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"ceremony-gate-v1.accoryn.testnet\",\"method_name\":\"get_session\",\"args_base64\":\"$(printf '{"dao_id":"accoryn-spike.sputnikv2.testnet","proposal_id":1}' | base64)\"}}" \
  | python3 -c 'import sys,json;print(json.dumps(json.loads(bytes(json.load(sys.stdin)["result"]["result"])),indent=1))'
```
**Expect:**
- `"status": "Voted"`
- attestations from `accoryn-alice.testnet` and `accoryn-bob.testnet`
- an `evidence_txs` entry

## 5. Run a full ceremony with your own accounts (about 20 testnet NEAR from the faucet, no real money)

1. Create three testnet accounts with your own names. Each gets 10 free testnet NEAR. Keys go to `~/.near-credentials`, never the repo.
   ```sh
   for n in yourname-a yourname-b yourname-c; do
     near account create-account sponsor-by-faucet-service $n.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
   done
   ```
2. Create a treasury whose transfers only the gate can approve (about 6 NEAR from the creator):
   ```sh
   cd web
   ACCORYN_CREATOR=yourname-a.testnet \
   ACCORYN_MEMBERS=yourname-a.testnet,yourname-b.testnet,yourname-c.testnet \
   ACCORYN_DAO_NAME=yourname-team \
   node scripts/create-gated-dao-testnet.ts
   ```
   **Expect:** `✓ yourname-team.sputnikv2.testnet created; policy gated (… governance 2 of 3)`, then a funding line and a spendable balance of about 1.58 NEAR.
3. Run one ceremony: open a session, two members attest, a third executes, and settlement is verified on chain.
   ```sh
   ACCORYN_DAO=yourname-team.sputnikv2.testnet \
   ACCORYN_HOST=yourname-a.testnet ACCORYN_ATTENDEES=yourname-a.testnet,yourname-b.testnet \
   ACCORYN_EXECUTOR=yourname-c.testnet ACCORYN_PAYEE=yourname-c.testnet \
   node scripts/smoke-ceremony-testnet.ts
   ```
   **Expect, in order:**
   - `✓ proposal created`
   - `✓ session opened — … requires 2`
   - two `✓ … attested`
   - `✓ gate executed vote`
   - `✓ settlement verified — proposal Approved, one transfer receipt of 50000000000000000000000 yocto, payee +0.05 NEAR`
   - `✓ evidence recorded`
   - `✓ participation`

   If the payee is also the executor, the balance check can be thrown off by gas. Prefer a fourth account as payee.

## 6. Live journal tests: idempotent payments and expiry

The test sends real 1-yoctoNEAR transfers from a sender whose key is in `~/.near-credentials/testnet/`. Use your own accounts from step 5:

```sh
cd web && ACCORYN_LIVE_TESTNET=1 ACCORYN_LIVE_SENDER=yourname-b.testnet ACCORYN_LIVE_PAYEE=yourname-c.testnet \
  node --test tests/near-live-testnet.test.ts
```

**Expect:**
- `✔ live testnet: one journaled 1-yocto transfer, reconciled final, never duplicated`
- `✔ … reconciles to expired`. This one takes about 30 s.

## 7. Sound between two devices (needs a phone)

- **Same laptop, about 1 minute:** run `npm run dev:lan --prefix web` in one terminal and `cd web && node scripts/acoustic-loopback.mjs` in another.
  - Two Chrome windows open and play chirps; keep them open and the volume unmuted.
  - **Expect:** a `SUMMARY` line with most trials decoded. We saw 14/15 audible-fast, 6/6 audible-fastest and 6/6 ultrasound.
- **Two devices, the real check:** follow [acoustic-check-manual.md](acoustic-check-manual.md) Part B, laptop ↔ phone on the same Wi-Fi via `https://<LAN-IP>:5173/acoustic-check/`.

## What you cannot test yet

The workspace screens (`/workspace/`) still show account, treasury, ceremony and receipt actions as unavailable. The engines above are not yet bound in `web/src/integration/bindings.ts`; that integration is the next task. Do not report a disabled button as a bug.
