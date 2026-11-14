# Runtime recovery checkpoint

User reported that the app would not open. No process was listening on port 5173, and the Wi-Fi address changed from 192.168.1.40 to 192.168.1.45. A detached shell launch did not survive command cleanup; the HTTPS Vite server was restarted in a persistent terminal session with testnet writes enabled. Keep that session and the laptop running while testing. LAN addresses can change again.

## Acceptance checklist

- [x] Laptop HTTPS entry, object-registration route and connected treasury render.
- [x] Current LAN HTTPS entry and actual testnet vault policy read succeed.
- [x] Public board renders independently verified settlement evidence; no browser page errors in the runtime smoke.
- [x] Real testnet account creation succeeds in an isolated diagnostic browser profile; no existing user key was changed.
- [x] Reproduce and fix an account-ownership race with a failing local HTTP regression. The first key lookup can precede account creation while the following account lookup sees it; recheck the original key at the account's returned block hash before declaring the username taken.
- [x] Live isolated-account vault → invoice → physical same-laptop audio → approvals → verified payout.
- [x] Relevant browser regressions passed; fix prepared as a cohesive local commit.
- [ ] User verifies live camera onboarding and phone/laptop audio on their devices.

The runtime test uses real local DINOv2 inference over labelled test-image fixtures and an explicit research handoff. This is not live-camera identity validation. Isolated testnet accounts and testnet funds only. Device audio and transaction outcomes must be reported as observed, not inferred from simulated audio or submitted transaction hashes. Any same-laptop audio success does not establish two-device reliability.

## Observed live result

On 2026-11-14 the fixed live browser journey passed in 2.1 minutes: two isolated accounts, `integration-a1538fe8.sputnikv2.testnet`, funding, proposal 0, real speaker-to-microphone exchange on the laptop, two attestations, execution, evidence publication and verified settled receipt. Transfer amount: 0.05 native testnet NEAR. [Payout transaction](https://testnet.nearblocks.io/txns/6A9NTQkjDdToTo6K32Pu6jXdzzmcaKKhcp3cu3JUb9gB). No mainnet funds were involved.

Verification: 199 unit tests passed (2 opt-in unit tests skipped), 12 connected-treasury/keystore browser regressions passed, one live payment test passed, type checking, build and packaged production smoke passed. The full 66-browser suite and Rust contract tests were not rerun for this focused client fix. No contract source changed.

Current entry links: laptop `https://localhost:5173/`; phone `https://192.168.1.45:5173/` on the same network. Restart from the repository root using `VITE_ENABLE_TESTNET_WRITES=1 npm run dev:lan --prefix web` if the terminal/server is stopped, and use the new printed Network address if Wi-Fi changes. A browser certificate warning requires the user to accept/trust the local development certificate.

The first live attempt stopped at an ownership error. A local HTTP regression proved that the old implementation could falsely classify a newly appearing account as taken because its missing-key result came from an earlier block. The fix checks the key at the returned account block. The initial failed run did not retain sufficient RPC timing evidence to prove that race was its exact cause; the fixed complete journey subsequently passed. Existing user keys and pending requests were untouched.
