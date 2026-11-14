# Testnet deployment record

Network: NEAR **testnet** only. No mainnet contract or funds are involved.

## Contracts

| What | Account | Code | Notes |
|---|---|---|---|
| Ceremony gate v1 | [`ceremony-gate-v1.accoryn.testnet`](https://testnet.nearblocks.io/address/ceremony-gate-v1.accoryn.testnet) | code hash `6RyhWz4BnSszxQg88ysQnECuFm2KWUXLUrdqVKtTcfBm` (267,086 bytes) | Built from `contracts/ceremony-gate` with `cargo near build non-reproducible-wasm` (rustc 1.93.0, cargo-near 0.22.0). Deploy tx [`F3qKGJhf…`](https://testnet.nearblocks.io/txns/F3qKGJhfFcTtpCVQXvz6NNLet3ddPEcfB55zgszmaTGn). Init: `factory_suffix=sputnikv2.testnet`, TTL 60–600 s, session deposit 0.1 NEAR. |
| Sputnik DAO factory | `sputnikv2.testnet` | default DAO code hash `AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH` (DAO v2.3.1) | Existing NEAR infrastructure; not ours. |
| Spike treasury | [`accoryn-spike.sputnikv2.testnet`](https://testnet.nearblocks.io/address/accoryn-spike.sputnikv2.testnet) | factory default | Created with the gated policy (Requestor/Admin = alice, bob, carol; Approver = the gate only). Create tx [`6xUWKjSV…`](https://testnet.nearblocks.io/txns/6xUWKjSVkbeQe41nw7QacfUupiA1PviRWzrpoXVphWns). |

| Demo treasury | [`accoryn-demo.sputnikv2.testnet`](https://testnet.nearblocks.io/address/accoryn-demo.sputnikv2.testnet) | factory default | Created by `web/scripts/create-gated-dao-testnet.ts` (tx [`3nEkmDrB…`](https://testnet.nearblocks.io/txns/3nEkmDrBLMsxyxp1CYK3vYKTSuN7m8mNyS7Adp7djMQm)). The stored policy passed `checkPolicyConformance`. A full ceremony payout ran on it: proposal 0, gate vote [`4cRDDg4u…`](https://testnet.nearblocks.io/txns/4cRDDg4us3deu25cntFZoEExek6tDUwzrLUy71nBH1nY). |

**Lock status: the gate still has one full-access key** held by the developers, so it can currently be upgraded. It will be locked (all keys deleted, verified with `view_access_key_list`) before submission, after the app integration has run against it. Until then, treat the gate as developer-controlled. After locking, fixes require deploying a new gate and switching each DAO to it through governance.

The build is not yet reproducible (Docker was unavailable), so the code hash above identifies the deployed bytes but cannot be independently rebuilt bit-for-bit. Anyone can still read the source at the commit noted in this file's history and compare behavior.

## Verified behavior on testnet

`node web/scripts/smoke-ceremony-testnet.ts --fund` ran one full ceremony against the spike treasury on 2026-11-13:

| Step | Transaction |
|---|---|
| Fund treasury with 1 NEAR | [`CBc1JtdB…`](https://testnet.nearblocks.io/txns/CBc1JtdBuX1PTRE4JN2Tr2H2UcFN3MBzYfqoo4GVPbyK) |
| Proposal 1: 0.05 NEAR to `accoryn-payee.testnet` | [`PyH7EHud…`](https://testnet.nearblocks.io/txns/PyH7EHud3v45Ldo33CArqVXjhMYW2twYHTU7cwXKKMf) |
| Open ceremony session (requires 2 attendees) | [`Dxx9U2MF…`](https://testnet.nearblocks.io/txns/Dxx9U2MF1WXUmrq5mmjFnDx7CRYxg5izu96TtXgLoAyq) |
| alice attests | [`BM6N9RSM…`](https://testnet.nearblocks.io/txns/BM6N9RSMWonGTSHcqYdph8ZS6LtAcfXM19xdajfGee2Z) |
| bob attests | [`7jYSFiRF…`](https://testnet.nearblocks.io/txns/7jYSFiRFRmjYnGGsiwSZdng1V1H8CjMeqtrnfC4m8Lko) |
| Gate votes; DAO pays 0.05 NEAR | [`4NKh8ik6…`](https://testnet.nearblocks.io/txns/4NKh8ik6P9a66RfDyUsaVNpbYSPVnBPmjNJwon2swzw5) |
| Settlement evidence pointer recorded | [`9YDEFtxq…`](https://testnet.nearblocks.io/txns/9YDEFtxqr362ug9R9YRdRubQ4Rjdo4ffewW7XPiS4wj5) |

A second run later the same day, on proposal 2, also passed: the gate vote was tx [`7EgpJgCY…`](https://testnet.nearblocks.io/txns/7EgpJgCYQfED8dgBUNQmEgKTY3E5gA2cQ8VpXGAV1wxf). A wasm built from a fresh clone of the committed source was byte-identical to the deployed code (same code hash) on this toolchain.

The script verified, from chain data only: proposal status `Approved`, exactly one successful DAO → payee `Transfer` receipt of 50000000000000000000000 yoctoNEAR, and the payee balance increased by exactly that amount. The ceremony challenge was generated in-process for this smoke test; no audio was involved. Recorded RPC responses are in `web/tests/fixtures/ceremony/`.

Earlier, on the same treasury, a human member's direct `VoteApprove` on a transfer failed with `ERR_PERMISSION_DENIED` (tx [`243Qb7ww…`](https://testnet.nearblocks.io/txns/243Qb7wwWDtXN6yyAiq6g1fVUjjppLkSpRuCbQ8ACHfB)).

## Hosted app

`https://accoryn.vercel.app` serves the static production build of `web/` with `VITE_ENABLE_TESTNET_WRITES=1` (testnet only, no secrets). Deployed 2026-11-14 from branch `feat/submission-readiness`. Every chain read and write goes from the browser to public NEAR RPC and the testnet account helper; there is no backend.

## Re-verification and hardening (2026-11-14)

Run with `ACCORYN_DAO=accoryn-demo.sputnikv2.testnet node scripts/smoke-ceremony-testnet.ts` from `web/`, against the unchanged gate (code hash `6RyhWz4B…`).

| Step | Transaction |
|---|---|
| Proposal 1 created (0.05 NEAR → `accoryn-payee.testnet`) | [`G2tqC3i3…`](https://testnet.nearblocks.io/txns/G2tqC3i36dE2DZoCyuVUBn4Z7AqqBcm7vubC1eQCXFTY) |
| Session 7 opened, 2 attendees required | [`DV9zrDaW…`](https://testnet.nearblocks.io/txns/DV9zrDaWX2LhqJH9n8vBG4Pif5DR24ooo6RZJhskivMf) |
| alice attested | [`3AE5BMk8…`](https://testnet.nearblocks.io/txns/3AE5BMk81oXw9KxnLnvhdCe1HunyT8QJa9LHZbwWmNec) |
| bob attested | [`47tWwkXy…`](https://testnet.nearblocks.io/txns/47tWwkXybBnZZHQnQVPcC8vEfYtx8rNJs6JDSqKH8ZFJ) |
| Gate vote → payout; settlement verified (one transfer of exactly 0.05 NEAR, proposal `Approved`) | [`CyEVTyRv…`](https://testnet.nearblocks.io/txns/CyEVTyRv4ErNqkW3vsYmWHjMv2oTh3fiYXSQGvfvmGFq) |
| Evidence recorded on the gate | [`ARrbq2fW…`](https://testnet.nearblocks.io/txns/ARrbq2fWPUYjMaLbDwt3Cd1sbwZsRHbSoyUafkVyVVvm) |

**Factory hardening on `accoryn-demo`:** alice proposed `FactoryInfoUpdate{factory_id:"sputnikv2.testnet", auto_update:false}` as proposal 2 ([`DYVFpZ4G…`](https://testnet.nearblocks.io/txns/DYVFpZ4GZ6YFxiMzN56akpBfctnn3Xo9c5enLro5zGeZ)); alice ([`6Woxe5HG…`](https://testnet.nearblocks.io/txns/6Woxe5HGupd4ZdqzoRomr52bM8mmnPdWftuan1igGYqv)) and bob ([`AX6ZyBgR…`](https://testnet.nearblocks.io/txns/AX6ZyBgRXnUE3ttKRPJxp9K5NwCL6sHAiUkRF7kv5pmZ)) approved it (G = 2 of 3). `get_factory_info` returns `{"factory_id":"sputnikv2.testnet","auto_update":false}`, so the factory owner can no longer replace this vault's code. Other vaults keep `auto_update: true` until their members pass the same proposal (Vault settings in the app).

## Transaction journal (live)

`ACCORYN_LIVE_TESTNET=1 node --test tests/near-live-testnet.test.ts` passed three times on 2026-11-13. Each run checks two things:
- a journaled 1-yocto transfer reconciles as final, and resubmitting the same request does not send a second transaction (for example [`GisScTWU…`](https://testnet.nearblocks.io/txns/GisScTWUH261pfkhJax7Mnm1cuAc7debnmDipCd4oRjw));
- a signed transaction that was never delivered reconciles as `expired`, but only after its nonce is verifiably consumed.

## Development accounts

`accoryn.testnet` (gate parent), `accoryn-alice.testnet`, `accoryn-bob.testnet`, `accoryn-carol.testnet`, `accoryn-payee.testnet`: faucet-funded testnet accounts. Their keys live in the developer's local near-cli keychain and are never committed. `accoryn-io-c3c5066d.testnet` (and `sub.accoryn-io-c3c5066d.testnet`) were created once by the testnet-helper verification and are throwaway; their keys were kept only in memory.

## Reproduce

```sh
cd contracts/ceremony-gate
./scripts/fetch-sputnik-wasm.sh      # exact DAO code from testnet, hash-checked, gitignored
cargo test                           # 16 unit + 5 sandbox tests against that code
cargo near build non-reproducible-wasm
```
