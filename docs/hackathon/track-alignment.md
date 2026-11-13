# Track alignment and implementation evidence

Reviewed: 2026-11-12. Product: a new team treasury interface exploring personal-object access and acoustic participation, using built-in device hardware only.

## Recommendation and current evidence

Target **Social Money** first and **Open Innovation** alongside it once the core NEAR flow is demonstrated. Add **Real-World Money** when a complete business invoice/payment flow works. This is a product-fit assessment, not an eligibility decision by the organizers.

Status update 2026-11-13: the application has real device checks and a local DINOv2 object-registration/score-comparison experiment ready for manual testing. It has no integrated NEAR treasury, calibrated object authorization, acoustic challenge protocol or payment settlement. Visual redesign is paused; work ownership is split in Context 1 and Context 2 at the repository root. Therefore none of these tracks is demonstrated by the shipped application yet. The UI plan is an enabling phase, not the track-qualified end product.

## Interpret the sources correctly

The three linked files are starter prompts, with particular example products. Their repository asks builders to adapt ideas while retaining useful requirements/checkpoints. The live event guidance explicitly clarifies that examples, protocol names and hints are not mandatory track criteria. We will retain applicable engineering expectations without claiming to implement the sample bounty or inheritance products. [Starter-prompt usage](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/README.md), [live event guidance, Q-011 and Tracks](https://nearhackathon.com/HACKATHON.md).

| Track | Relationship to our product | Evidence needed before we claim the fit |
| --- | --- | --- |
| Social Money (`social`) | Teams coordinate a shared budget and approve expenditures. This is the lead audience and strongest fit. The brief favors existing Sputnik DAO/Trezu custody and approvals. | A real treasury, named members, a policy read from the chain, a shared payment proposal, independent eligible votes, and a verifiable payout. Show exactly what the new meeting workflow adds. |
| Open Innovation (`open`) | Personal-object access plus an acoustic approval session is an experimental interaction worth evaluating. | A working object-access research flow and two-device acoustic exchange connected to the NEAR proposal; reproducible tests, measured failures and an honest security boundary. Novel visuals or a wallet connection alone are insufficient. |
| Real-World Money (`realworld`) | A team approving and paying an actual business invoice is a plausible extension. Treasury approval alone is too broad to show this business workflow. | Invoice details, real payment reconciliation, a receipt, sensible gas sponsorship and a usable CSV export. Stablecoin and cross-chain claims need their own completed integration evidence. |

Sources: [Social Money brief](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/12-social.md), [Open Innovation brief](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/13-open.md), [Real-World Money brief](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/08-realworld.md).

## Social Money: build the new interaction around a real treasury

**Existing capabilities:** Sputnik documents roles, proposal creation, approval/rejection, configurable voting policy, native/NEP-141 transfers, and function-call proposals. Trezu documents member roles and automatic execution when its configured approval threshold is reached. These already cover much of the ordinary multisig workflow. [Sputnik contract documentation](https://github.com/near-daos/sputnik-dao-contract#proposals), [Trezu treasury and governance overview](https://github.com/NEAR-DevHub/trezu-docs/blob/main/what-is.mdx).

**Proposed integration decision gate:** assess Sputnik's public testnet flow first, with Trezu's UX/API compatibility assessed separately. Verify the actual deployment, contract version, policy and available interfaces before pinning an adapter. Do not assume both integrations are required or that Trezu's current deployments have the same networks and interface as Sputnik. An existing-treasury adapter is the preferred direction; it is not implemented or a replacement for a security design.

**What we add:** the object-only research access ceremony, a meeting session bound to one immutable proposal, a fresh acoustic exchange between declared participants, explicit independent consent, shared progress and understandable receipts. A session must bind network, treasury ID, proposal ID/content hash, participants, expiry and nonce. It must never turn “heard sound” into a spending vote.

**Enforcement question that must be resolved before the payment feature:** a browser or relayer refusing to send a vote does not prevent a member voting through another client. Existing treasury policy remains authoritative. Demonstrate bypass attempts. If the user-facing promise requires acoustic completion to be enforced for a protected payout, design and test an appropriate on-chain integration/policy gate; verify its caller permissions, attestation trust and any alternate spending path. If that cannot be enforced with the selected treasury, return with a concrete architecture tradeoff. Do not silently ship an optional frontend check as mandatory treasury security. A custom NEAR contract remains eligible under Q-011, but is a deliberate design choice rather than something the track demands.

The example's bounty board, contribution reputation and payout tiers are specific to its bounty product. They are not in our current scope. If added later, reputation must be earned from real records and threshold rules must not silently bypass the user's participation policy. We will not claim to have completed that sample checklist.

## Open Innovation: make the experiment assessable

Keep the two distinctive ideas and measure them. Object scans should distinguish the enrolled instance from unrelated and similar objects, with separate enrollment/evaluation sessions. Evaluate camera/device variance, printed photos, screens, prerecorded input, object loss and unsuitable objects. Define where keys exist and what recovery means; an image is not a high-entropy private key.

Test fresh acoustic messages, expiry, replay, changed proposals, wrong participants, noise, unsupported devices and live relay. An acoustic exchange is not an unrelayable room boundary or proof of a distinct human. Publish results and unresolved cases. No NFC or external hardware is introduced.

NEAR's concrete role is the authoritative proposal, member policy, independent authorization and settlement state. Removing that integration should remove the actual treasury execution path. Chain Signatures is optional; our product does not need inheritance, Bitcoin guardians or artificial waiting-period features merely because the example uses them.

## Real-World Money: conditional business-payment milestone

Proposed business case: a small team collectively authorizes a contractor's invoice during a review meeting. The invoice is a reason to approve a payment, not a pretext to add mandatory physical attendance to every low-risk expense. Validate that need with intended teams.

The later feature should capture invoice reference, recipient, exact amount/asset, line items, due date and payment purpose; connect it to one proposal; reconcile its actual payout; and export amount, asset, network, recipient, status, timestamps, proposal ID and transaction IDs. Treat an RPC timeout as an unknown outcome requiring reconciliation, not permission to pay twice. A failed or refunded payment must be distinguished from a pending or settled one. CSV values from users must be safe when opened in a spreadsheet.

Use a tightly scoped sponsor for supported calls if gasless interaction is claimed. Verify signed delegates, target contracts/methods, actions, nonce/expiry, gas and deposit limits. Sponsoring gas does not automatically cover proposal bonds, account storage, deposits or cross-chain fees. [NEAR meta-transaction relayer documentation](https://docs.near.org/web3-apps/tutorials/meta-transactions).

**Network constraint:** the official 1Click quickstart says NEAR Intents has no testnet. The starter example's request for a testnet paid flow therefore cannot be interpreted as a real testnet 1Click settlement. A NEAR-only testnet invoice payout can verify our own bookkeeping and treasury integration; it must be labelled a testnet demonstration. A `dry` quote is a quote, not payment. A completed 1Click path requires a separately scoped small mainnet transaction with approval of the exact spend. A test token must not be described as redeemable USDC. [1Click quickstart](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/introduction).

A complete NEAR-only business payment can support this track because Intents is a hint, not a mandatory integration. Without the invoice/payment evidence, leave this track conditional rather than overstate readiness.

## Delivery gates and test evidence

This roadmap orders later designs; it is not authorization to skip the feature-by-feature manual gate or an implementation plan for all subsystems.

| Gate | Deliverable | Automated/integration evidence | Manual evidence |
| --- | --- | --- | --- |
| 0 — current readiness | Existing real device checks | Native browser permission denial/retry, real Web Audio and explicit confirmation, reset/layout tests | Three device-check happy paths accepted by user; device/browser matrix and extra failure/lifecycle cases unverified |
| 1 — approved UI foundation | Tokens/assets, reference page, landing and restyled real readiness | Responsive/reduced-motion/keyboard/link tests; existing media regressions; no synthetic money states in the working app | Visual hierarchy, touch feel, motion interruption and physical sensor regression |
| 2 — real NEAR treasury slice | Read one testnet treasury/policy, create a proposal and execute eligible votes | Actual RPC/contract outputs; rejected/unauthorized/duplicate votes; insufficient approvals; receipt and receiver-balance checks | Two independent members review the same proposal and observe the result; consent needed for signed transactions |
| 3 — object-only research access | Guided enrollment, instance verification and disclosed key/recovery model | Held-out real captures, same-category/wrong-object/spoof tests, cold/warm timings | Re-enrollment and cross-device scans with ordinary objects |
| 4 — acoustic-bound workflow | Fresh two-device challenge integrated with proposal consent | Physical-device exchange logs; replay/expiry/mutation/relay and alternate-client bypass tests; on-chain policy tests where enforced | Meeting on target phones/laptop under noise and interruption; no guaranteed same-room claim |
| 5 — business invoice payout | Invoice-to-proposal-to-payout-to-receipt/CSV | Real testnet payment, reconciliation after timeout, duplicate prevention, CSV field/safety tests; restricted sponsor tests if included | A bookkeeper can identify payee, purpose, amount, result and transaction evidence |
| 6 — optional 1Click | Completed cross-chain invoice payment | Real API responses plus actual deposit, final destination outcome or refund evidence; never a fabricated testnet endpoint | Separately approved mainnet spend and end-to-end result |

Keep implementation small enough to produce one complete, reproducible core demo. Do not delay the first real NEAR flow for cross-chain features, reputation, inheritance or decorative 3D infrastructure. Funding, integration writes and any repository-publication action receive the appropriate concrete user approval; normal private phase pushes retain the user's existing authorization.

## Submission evidence

Before submission: verify the live rules again; select only tracks supported by the finished demo; provide a public licensed repository, reproducible “do X, see Y” instructions, the human's demo post and exact verified integration details. The current deadline is 2026-11-14 at 23:59 UTC (2026-11-15 at 05:29 IST). Testnet-only projects are eligible. Multiple fitting tracks go in one submission. Repository publication, the public post and final submission remain separate actions, not consequences of approving a design. [Live event guidance](https://nearhackathon.com/HACKATHON.md).
