# Context 1 app checkpoint — manual test

Private test URL: https://team-treasury-device-lab.glassygrant5.chatgpt.site/workspace/

Review branch: `feat/context-one-delivery`; draft PR: https://github.com/anynomousfriend/Accoryn/pull/2.

This checkpoint adds real browser-local invoice preparation and the app-side integration boundary. Account/treasury/acoustic/payment/reconciliation operations are unavailable until Context 2 provides reviewed real adapters. It is not a completed financial demo.

1. Open `/object-registration/`, then **Prepare a team payment**, or directly `/workspace/`.
2. In **Payment draft**, enter an invoice reference, a syntactically valid treasury/recipient such as `team.testnet` and `supplier.testnet`, purpose and due date. These names are examples for a local draft, not created accounts.
3. Enter an invoice line, quantity 2, unit amount `1.000000000000000000000001`. Save locally, then **Review exact payment**. Expect `2.000000000000000000000002 NEAR` and atomic amount `2000000000000000000000002`. **Submit proposal** must remain disabled without real account/treasury services.
4. Add/remove another line; review must clear after an edit. Save, reload, then open the saved reference. All fields should be preserved. Saving stores invoice data in this browser only; another browser/device does not inherit it.
5. Delete the selected draft with confirmation, reload and verify its removal. Canceling deletion must preserve it. **Clear local drafts** requires confirmation and does not delete pending-action/proposal-reference records.
6. Try blank reference, invalid account spelling, negative/zero unit amount, fractional/zero quantity and too many decimal places. Saving/review must fail; previous saved drafts must remain. Storage-blocked/full/corrupt cases must not report successful persistence or silently replace data.
7. Visit **Account**, **Team treasury**, **Approval session** and **Receipts**. With no engines installed, no account, fake balance, policy, sound success, approval, payout or receipt should appear. Financial/codec actions and receipt export remain disabled. No sensor permission request starts merely from navigating these sections.
8. Inspect phone portrait/landscape and laptop layouts, keyboard Tab/Enter, fields with the software keyboard visible, and long labels. Controls should remain reachable without horizontal page overflow. Draft editing must not activate camera/microphone.
9. Recheck existing object registration. The white crop guide now follows the processed square boundary. Its research similarity scores still do not create/unlock an account. Physical camera capture remains a user acceptance check.

Report device/browser, failed step and exact visible behavior. Do not share private object photos, credentials or sensitive invoice data.

Automated coverage includes real LocalStorage/IndexedDB/native browser behavior, actual model inference and production-bundle checks. Pure formatter/validation and seeded-metadata tests do not establish real treasury authorization or settlement. Complete financial-flow manual steps will be added only after actual Context 2 integration.

## Additional review regression checks

- Open two tabs before saving. Save different invoices in each: both must survive. Open the same saved invoice in both; delete it in one, then try saving a stale edit in the other. Expect a conflict, not resurrection or loss of unrelated drafts.
- Submitted-reference lists and pending-action banners are based on retained metadata, independent of local invoice drafts. No genuine references exist until engine integration; seeded-metadata automated tests are not real transactions.
- A future connected participant must see the canonical treasury, network, native asset, readable exact amount, atomic amount and purpose together before consent. Browser component tests cover this rendering now; actual independent approval waits for Context 2.

Final automated check after review fixes: **33 unit tests, 51 native-browser tests, TypeScript, production build and real packaged model/workspace smoke passed**. Web Locks protects concurrent local writes; unsupported browsers receive an explicit failure. Customer/device acceptance, custody/chain verification and spreadsheet application import behavior are not established by these counts. GitHub CI is not activated by the local test run.
