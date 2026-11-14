# Guided vault journey and member object checks

Implement on `feat/near-tooling-testnet-rate-limit` only. The user requested implementation of member objects and a complete UX repair, including aesthetics; this resumes visual work for this release. Main and other experimental branches remain untouched.

## Intent

People should always understand their current task, what happens next, and whether money has actually moved. Associate a local object template with each vault/account pair, and require a fresh comparison and explicit research acknowledgement before the shipped application signs a member approval.

## Approach and boundaries

Keep the existing React/Tailwind application and real NEAR engines. Replace the long operations console with task navigation, contextual summaries and inline steps. A purely cosmetic reskin would leave the navigation problem intact. A new backend verifier or contract migration would introduce a new trust model without authorization, so this release preserves on-device processing and existing custody.

Object scans are **research checks**, not cryptographic authentication. There is no calibrated same-object threshold. The UI must say “Identity unproven” after comparison, allow retaking, and require explicit acknowledgement to continue the experiment. Do not invent a probability, “verified” identity, or a security cutoff. This does not enforce an object requirement on-chain or stop someone signing outside this client. Browser signing keys remain unencrypted/extractable; audio can be relayed.

## Journey

1. Home opens the workspace account step. Explain testnet/browser-key custody once; explicit ten-minute browser session consent precedes account creation/selection. Account creation no longer depends on an unrelated global object registration.
2. Vault: open an existing vault (including invitation URL), or create one through Name → Members → Review. The creator is automatically included in the reviewed list; show the exact 6 NEAR creation attachment before signing. Preserve read-only vault lookup while signed out.
3. Member object: an on-chain member enrolls three views in the vault/account-specific local template. The creator cannot enroll for another member. Each member opens the invitation on their own device. Remote enrollment status is unknown, never fabricated. A new device needs its own local enrollment; no claim of recovery or global identity continuity.
4. Payment: fund the vault or prepare an invoice with the loaded vault fixed. Keep invoice line details available, but reduce repeated vault IDs. Explicit saved-draft review precedes submission. Preserve duplicate prevention and original-intent recovery.
5. Approvals: load a proposal from an invitation or an ID; review the exact amount, recipient and purpose. Enroll if necessary, then compare a fresh scan for this account/vault/payment/session. The host opens a session; listeners listen before host playback. Each participating member explicitly consents and signs. Explain the next action based on actual chain state. Execute only at the real required threshold. Keep evidence publication separate from execution and settlement claims.
6. Activity: verified receipts and a shareable keyless board. Settings holds governance and recovery operations. Pending unknown requests remain visible across all tasks and block new submissions.

## State and storage

Reuse TemplateStore validation/IDB transactions, with a namespaced record key based on the exact vault/account pair; preserve the legacy `active` record untouched. Inject the scoped store into the existing camera/inference controller. Do not persist photos or comparison acknowledgement. The in-memory comparison acknowledgement binds account, vault, proposal content hash, session ID, template/model identity and a maximum two-minute lifetime (also bounded by session expiry). Recheck the current template immediately before signing. Invalidate on account/vault/payment/session changes, local template replacement/deletion, tab hiding, navigation away, stop, and expiry. A resumed unknown approval may reconcile a previous signature without rescanning; it must not generate a new approval signature without a new check.

## UX and appearance

Use cobalt actions, ink typography, light neutral surfaces, restrained borders, generous spacing, consistent 48px controls and responsive task navigation. No decorative hero SVGs or unnecessary animations. Hick: one task at a time. Jakob: familiar account/vault/payment navigation. Fitts: large separated actions. Recognition: carry vault/payment context in links and summaries. Progressive disclosure: technical details and governance out of the normal path. Error prevention: explicit financial review, exact pending request recovery, no automatic write on navigation. Visibility: distinguish draft, submitted, approved, executed and evidence-verified payout.

## Acceptance checklist

- [x] Home has a clear starting action and responsive task navigation.
- [x] Account creation/selection works without global-object onboarding.
- [x] Vault creation is guided and reviews its exact member list and deposit.
- [x] Scoped templates isolate two accounts and two vaults and preserve legacy data.
- [x] Actual DINOv2/camera controller is reused; no fake captures in product.
- [x] Non-members cannot enroll as a vault member through the workspace.
- [x] Fresh comparison acknowledgement is explicitly research-only and bound to the exact payment/session/template.
- [x] Stale/hidden/replaced/missing checks cannot authorize a new member approval in the app.
- [x] Pending requests, invoice duplicate prevention, chain membership checks and verified receipts remain intact.
- [x] Invitation links carry only public context; no keys, templates or raw scans.
- [x] Automated suites and a real integration attempt are reported accurately; physical two-device testing remains a user checkpoint.

Builder choices: component boundaries, exact spacing and copy, one persistent engine controller, task selection in URL hash, and local-only recent vault references. No new dependencies are needed.
