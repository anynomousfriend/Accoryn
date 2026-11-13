# Problem evidence and validation questions

Reviewed 2026-11-13. This is desk research, not customer validation or a claim that our proposed ceremony prevents fraud.

## Observations from primary sources

Trezu describes shared treasuries governed by members, roles and approval thresholds, and notes that members can use alternative interfaces/CLI tools to manage the same on-chain treasury. This supports collective spending as an existing workflow and reinforces why a UI-only acoustic gate is bypassable. It does not establish demand for physical attendance. [Trezu security/governance documentation](https://github.com/NEAR-DevHub/trezu-docs/blob/main/what-is.mdx).

Safe documents account owners, a configurable signature threshold and contract verification before execution. Its transaction service can gather off-chain signatures. These are existing alternatives for collective approval; our app cannot market ordinary multisignature approval as a new capability. [Safe account concepts](https://docs.safe.global/advanced/smart-account-concepts), [Safe transaction service](https://docs.safe.global/core-api/api-safe-transaction-service).

## Hypothesis to test with intended teams

A small team that already reviews important expenses together may benefit from a shared, exact-payment review ceremony and understandable receipts. Requiring co-attendance for routine expenses may instead slow approvals and exclude legitimate remote members. This is an inference/hypothesis, not a verified user finding. Object scanning may reduce perceived seed-phrase friction, but its custody/recovery and spoofing limitations may outweigh that benefit.

## Evidence still needed

No interviews or measured customer trials have been supplied. Ask intended teams to describe a recent shared payment, who approved it, what errors/delays occurred, their current alternative, and whether physical attendance would have helped. Compare task time, review comprehension, wrong-recipient/amount detection and abandonment against their existing workflow. Test invoice-to-receipt reconciliation with a bookkeeper. Collect privacy-appropriate notes and consent; do not publish or send outreach from tools without authorization.

Reject or narrow the physical-attendance requirement if teams primarily need asynchronous approval. Keep the market claim tied to demonstrated benefit, not just the novelty of sound/object scanning. Track eligibility and final public submission still require rule rechecks and a real NEAR integration; this app-only checkpoint does not demonstrate those outcomes.
