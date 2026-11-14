# Guided vault flow — manual acceptance

This release is local to `feat/near-tooling-testnet-rate-limit`. It changes the app journey and associates a local object enrollment with each member/vault pair. It does not change the deployed contracts or add a verification server.

## Start

```sh
VITE_ENABLE_TESTNET_WRITES=1 npm run dev:lan --prefix web
```

Use the printed **LAN HTTPS address on both laptop and phone**, on the same network. Using the LAN address on the laptop makes invitation links usable on the phone; `localhost` links only work on the laptop. Trust the local development certificate yourself if prompted. Keep browser data: accounts and enrolled templates are specific to that browser/origin. A localhost profile and a LAN-address profile are different local stores.

Use **two different accounts**, one on each device. No real money: this release transfers native NEAR on testnet, not USDC or other stablecoins. Keep both tabs visible during the acoustic exchange. Device help opens separately so you can return to the workspace tab.

## 1. Account, on each device

1. Open `/`. You should see **Your team. One shared vault.**, with Account selected.
2. Read the browser-key notice and press **Start browser session**. Sessions last ten minutes. Restarting the session does not regenerate existing keys.
3. If you already have an account in this exact browser/origin, choose it under **Local account**, then **Use local account**. Otherwise enter a new lowercase **New username**, then **Create testnet account**.
4. Wait for chain confirmation. You should move to **Vault** with your full `name.testnet` account shown as signer. Object enrollment is a later member step; it does not generate this account’s key.
5. If the free helper returns **429**, stop repeated attempts. Keep this browser’s original key and pending request; respect the displayed cooldown, then reconcile/resume that original request. Do not clear storage or rotate names/services to evade the quota.

## 2. Create and open a vault

1. On the host choose **Create a vault**. Enter **Team name** → **Next: members**.
2. Select your partner under **Select vault members**. Their account appears after they create/select it on their device; press **Refresh demo users** if needed. Your selected creator account is included automatically. Press **Review vault**.
3. Check both accounts and the **6 testnet NEAR** creation attachment. Press **Create shared vault — 6 testnet NEAR** once and wait.
4. The host moves to **Member object**. First enroll as described below, then use **Vault** to return to the overview.
5. Copy the **Member invitation link** to the partner. The partner selects their own local account, chooses **Vault**, verifies the prefilled **Treasury account**, then presses **Load treasury**.
6. Compare the vault’s member list on both screens. Only current on-chain members can enroll through this workspace. No device can report another member’s local object enrollment status.

## 3. Member object, on each device

1. Open **Member object**. Confirm the displayed account and vault are yours.
2. Choose a distinctive, textured object. Press **Start registration**, allow the real camera, keep the object inside the square, then **Capture view** → **Use this view**.
3. Repeat for the three prompted views, rotating the object slightly. Retake poor views. Enter a non-sensitive **Object label** and press **Save visual template**.
4. Expect “Visual template saved locally. Photos discarded.” Press **Continue to payment**.
5. Enrolling on another account or vault must not reuse this enrollment. A legacy global template is preserved separately and is not silently assigned to a member.

**Meaning:** this is a local research enrollment and approval checkpoint. It is not a wallet key, cryptographic identity, or proof that a person is physically present. The model has no validated same-object threshold. A photograph/print/screen may still produce a similar embedding. Do not interpret a high score as protection against stolen signing keys.

## 4. Fund and request payment

1. On the host open **Vault** → **Fund your vault**. Start with **1 NEAR** → **Fund loaded vault**. Wait for confirmation; refresh the vault if necessary to read its new spendable balance.
2. Open **Payment** → **New invoice**. The loaded vault is carried forward.
3. Select the partner under **Choose recipient**, enter a **Purpose**, and **0.05** as **Amount in NEAR**. Optional reference/date and itemized invoice editing are available separately.
4. Press **Save local draft**. Review the saved recipient, vault, purpose and lines, then tick **I reviewed the exact native NEAR payment and loaded vault**.
5. Press **Submit reviewed invoice proposal** once. Expect a numbered proposal and automatic navigation to **Approvals**. Saving or submitting a proposal is not a payout.

## 5. Meet and approve

1. Both members read the exact amount, recipient and purpose in **Approvals**. The partner can use the payment invitation link, open the vault, then use **Transfer proposal ID** → **Refresh payment and ceremony**.
2. Host: press **Open host session — 0.1 testnet NEAR**. The session lasts five minutes. Partner: refresh the payment/session.
3. On **each device**, press **Compare a fresh scan**, capture your enrolled object, then **Compare this scan**. Expect **Scan compared · identity unproven**. Measurements are under **View measured similarities**.
4. If it is the wrong object, retake it. The app cannot yet make a reliable same-object verdict. To test the research flow, explicitly acknowledge its limits and press **Use this research check for this payment**. This records a local acknowledgement for this exact payment/session for at most two minutes; it is not a model verification success.
5. Partner: **Listen to host sound**. Host: after the listener is ready, **Play host sound**. Use built-in speakers/microphones with reasonable volume and quiet surroundings. Both should report **Sound exchange ready**.
6. Each member checks **I approve this exact recipient, amount and purpose as a vault member**, then **Sign member approval**. Wait for each confirmed outcome.
7. Refresh the payment on the executing device. When the real required threshold is met, press **Execute approved payment** once.
8. A hidden tab, navigation, cancelled operation, expired check, changed template, account, vault, proposal or session requires a new applicable comparison. Unchecking the research acknowledgement revokes it. Refreshing/reconciling an already signed request does not authorize a duplicate payment.

## 6. Receipt and sharing

1. After execution, choose **Publish verified payout evidence** if available.
2. Open **Activity** → **Load chain receipts**. Expect the exact payment to be **settled** only after successful transfer evidence has been independently checked.
3. Open the explorer payout link, download receipt CSV if useful, and open **Open shareable read-only board** on a third browser without keys. It should display the same public payout evidence.
4. **Settings** contains member-policy proposals and factory upgrade hardening. Those are separate governance actions; they are not needed for an ordinary payment demo.

## Failure checks to report

- Camera denied: actionable error, no saved enrollment or successful scan. Restore permission manually and retry.
- Wrong object: report it; no identity guarantee is claimed. Do not use this prototype with real funds.
- Switch account/vault: the other scoped enrollment must not appear.
- Hide the tab or withdraw research consent: the acknowledgement must stop authorizing a new approval.
- Refresh during an uncertain request: retain **Pending request**, reconcile the original ID, never click a second equivalent payment.
- Sound timeout/expiry: no silent fallback or auto-approval. Stop, refresh and follow the current session instructions.

## Verification record

Automated inference fixtures test calculations, storage and UI transitions; they do not substitute for the two-device camera/audio exercise above.


### Release results, 2026-11-14

- Full unit suite: **204 passed, 2 live-test skips** (206 total).
- Full browser suite: **74 passed, 1 opt-in physical/testnet skip** (75 total).
- Typecheck/build passed. Production smoke includes real WASM inference, model identity/vector checks, route entry, native template read/delete, cancellation/failure and no image uploads. Vite reports the existing large-bundle advisory; no dependency change was introduced.
- Visual QA inspected desktop and 390px mobile captures, plus an actual read-only testnet vault; no page errors. A failing mobile first-action test was added, then passed after compacting navigation.
- Real live attempt: created `ac-mwg6eye8-a.testnet`, `ac-mwg6eye8-b.testnet` and `guided-integration-957b2f76.sputnikv2.testnet`. The automated browser denied camera access. **This run did not complete enrollment, approvals or payout.** No fake media was substituted and no claim of physical acceptance is made.
- Independent review: signature-time authorization, late-cancel guard ownership, withdrawn research consent, blocked-storage startup and stale-vault funding mismatch were fixed and rechecked.
- Contracts are unchanged. Physical object discrimination, varying angles, replay resistance and phone/laptop sound remain unproven and require the manual checkpoint.

### UX review

| Before | After | Why |
| --- | --- | --- |
| Six operational sections on one long screen | One selected workspace task with persistent context | Reduce simultaneous choices; make the next action recognizable |
| Global object comparison before account creation | Account first; scoped enrollment inside vault membership | Place the research step where it is used |
| New vault fields and chain action together | Name → Members → Review | Progressive disclosure and explicit error prevention |
| Re-enter vault IDs across invoice forms | Loaded vault carried into a three-field payment composer | Recognition instead of recall; reduce mismatched inputs |
| Technical sound/attestation controls without next-step guidance | Actual payment state explains scan/listen/approve/execute steps | Keep system status visible and distinguish approval from payout |
| Mobile primary action below the initial viewport | Compact navigation and less redundant initial text | Make the first action discoverable without hunting |
| Advanced policy actions in the normal payment path | Governance in Settings; pending recovery always visible | Separate occasional work while preserving recovery |
