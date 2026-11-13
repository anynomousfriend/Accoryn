# End-to-end testnet integration

User instruction: integrate the delivered engines end-to-end, then hand over for manual testing. The user explicitly selected the existing tested member-listener ceremony for this first release; a separate external recipient response is deferred. Use the existing basic screens and native execution, one final independent reviewer. Do not reopen approved engine custody or add a new multisig.

## Journey and authority

Device checks → local object registration/fresh comparison → explicit research-session confirmation → create/select app-made `<username>.testnet` account → create a gated Sputnik treasury with existing member account IDs → prepare invoice → submit exact proposal → eligible host opens on-chain session and broadcasts sound → other eligible member listens and checks session public key → each independently reviews and attests → any eligible member executes → verify exact payout receipts → record evidence → list real receipts and export CSV. Read-only board requires no account. Account labels are NEAR account names, not an invented username registry.

The object model has no validated acceptance threshold. Do not invent one during wiring. A user may explicitly acknowledge a completed real comparison to open a short-lived local testnet demonstration session; this is manual research confirmation, NOT automated object authentication, possession proof or protection of extractable keys. The app says this before creating/selecting any key. A completed comparison never silently authorizes a financial action. Refresh/relock requires another explicit scan confirmation. Raw photos and keys never enter journals, logs or the board. No mainnet or remote telemetry.

All writes use the engine journal and persisted operation metadata before signing. UI pending intents and engine request IDs retain their association across reload/cancellation. Unknown outcomes block unrelated retries. Reconciliation confirms both chain outcome and intended business result, including void factory/callback returns. Never auto-send a different transaction under a new ID after uncertainty. Metadata must support recovery on a different tab without requiring a new signature. Proposal lookup uses on-chain request tags rather than racing last-ID guesses.

Treasury policy, amount tiers, governance threshold, gate address/code hash and spendable balance are authoritative reads. A session binds network, DAO, proposal, recipient, amount, policy and eligible participants. Consent is separate from sound. Seeds stay in memory only, expire with the session and are cleared on hide/cancel/proposal change. Open-session is a journaled write; audio starts only after its canonical result is checked. AudioContext init occurs synchronously inside a tap before network awaits. Host can stop playback without losing an unresolved transaction record. A listener rechecks the canonical session and proposal before attest. Receipt settlement needs exactly one successful expected transfer; evidence pointers alone do not prove settlement.

Members are initially provided at vault creation. Membership/recovery changes use atomic policy-change governance proposals with the existing required governance votes; never pretend local invitations change on-chain membership. A lost key cannot be recovered from an object: remaining governance members replace the account. Factory auto-update hardening is a visible governance action; do not claim hardened before chain confirmation. Do not delete the deployed gate's last key in this integration task.

## Architecture

Use a separate typed adapter under `engines/app/` and a connected `/treasury/` screen, keeping the existing v1 draft workspace compatible. This avoids coupling the actual gate roles and amount tiers to the old fixed-threshold service stub. `engine.ts` owns accounts and authoritative reads; `writes.ts` owns operation plans, journaled writes, recovery and ephemeral sound; `protocol.ts` validates canonical sessions. `/board/?dao=` reads without opening the signing-key database. Preserve the existing engine modules. Basic UI is split into account, treasury/governance, ceremony and board views as needed. Keep exact amount arithmetic and the existing UI action barrier. Test-only local HTTP fixtures remain labelled; no successful fake adapter is shipped. Enable testnet writes only with an explicit runtime build setting; real read-only views can be available independently.

## Acceptance

- Real browser account creation and exact key ownership verification; no re-generated key on retry.
- Real treasury creation/read policy and tier display, idempotent proposal submission and canonical recovery.
- Physical member-listener exchange, separate independent member approval, threshold failure, execution and settlement receipt.
- Stale proposal/session/consent, changed membership, expiry, reload, cancellation, duplicate requests and wrong amount/network fail visibly.
- Read-only public board and spreadsheet-safe export use actual service data.
- Full web suite, real testnet service exercise and browser journey evidence with physical/model-fixture limitations stated. No claim of camera/phone coverage from fake streams. Manual steps and working laptop/phone URLs at release.
