# Shared demo users — manual test

This feature is local to `feat/near-tooling-testnet-rate-limit`. Start the existing HTTPS LAN server with `VITE_ENABLE_TESTNET_WRITES=1 npm run dev:lan --prefix web`. The directory is part of the development server, not a deployed identity service.

## No-typing demo path

1. Reload the app on phone and laptop. Keep using the address where each device's keys were created.
2. On each device, choose **Start browser session → Local account → Use local account**. A new account is shared automatically after confirmed creation; selecting an older account shares its public ID now. Wait for account confirmation. No key or object template is shared.
3. On the laptop choose **Vault → Create a vault → Team name → Next: members**. Your own account is included automatically. Tick your partner in **Select vault members**, then **Review vault**. No member ID needs typing.
4. If the partner is missing, select their account on the phone once, then press **Refresh demo users** on the laptop. While connected, the list also refreshes approximately every five seconds. Verify the full ID displayed before choosing it.
5. Continue the normal object enrollment and vault funding steps from the [guided flow](2026-11-14-guided-vault-flow.md).
6. Under **Payment → New invoice**, use **Choose recipient** to select the partner. Fill purpose/amount, save, review the full recipient and submit as before.
7. In **Settings**, member-policy editing uses the same checkboxes and starts with the current roster. Review the complete next roster before proposing a membership update. Selecting a user is not itself an on-chain membership change.

## Expected boundaries and failure checks

- A user discovered from another device must **not** appear as a usable **Local account** on this device. You can nominate/pay them, but cannot sign as them.
- A directory refresh failure must retain the checked members and recipient. The app explains the failure and provides refresh/manual entry.
- Optional **Enter member IDs manually** and **Enter recipient ID manually** support an account outside the directory. Static production builds use this fallback because they have no shared dev-server API.
- A username in the directory means a public testnet account was admitted after an existence check. It is not proof of identity, wallet ownership or vault membership.
- Public IDs persist across dev-server restart in ignored `.local/demo-users.json`. Never copy signing keys into that file. It is not part of Git.
- This is the current local demo's directory, not an index of all NEAR users. An older browser's accounts become discoverable when their owner selects them once.

## Verification

Tests cover native HTTP/filesystem persistence, concurrent deduplication, rejected extra/private fields, missing accounts, RPC failure, full/corrupt storage, HTTP/1 and HTTPS HTTP/2 origin handling, cross-browser selection, local signer isolation and retained selection on failure. An opt-in read-only test uses the retained diagnostic browser profile: the actual account screen verifies key ownership on testnet and sends only `{accountId}` to the directory; an isolated observer can then select the public ID without receiving its key. No testnet funds are spent by that check.

The existing physical object/acoustic acceptance limits remain unchanged. This release does not claim a new physical end-to-end payout test.


### Release results

- Full unit suite: **210 passed, 2 opt-in skips** (212 total).
- Full browser suite: **77 passed, 2 opt-in skips** (79 total).
- Actual retained-profile account selection/public-only publication: **1 passed** separately, with read-only testnet ownership verification and an isolated observer. No faucet request or transfer was made.
- Typecheck/build and production smoke passed, including explicit manual member entry when the directory API is absent.
- Independent review found a hanging-refresh issue; a failing regression reproduced it, and the fixed client now times out and re-enables retry. HTTP/2 origin admission also has a regression and was verified through the actual account screen.
- One pre-existing randomized acoustic software-fixture assertion failed in the initial parallel check; its isolated test and the full unit rerun passed without acoustic-source changes. This release does not claim to improve physical sound reliability.
- Phone/laptop manual acceptance remains pending. Existing object recognition and physical acoustic limitations remain as documented in the guided-flow checklist.
