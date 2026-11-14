# Reference-led treasury experience revamp

Status: approved and implemented. Merged into `main` as `ab53a45`; automated release verification passed; user manual acceptance is pending.

## Intent and scope

Revamp the landing page and complete working treasury experience to follow the user's Variant reference: https://variant.com/shared/9291a8ff-32c0-4c3f-ab68-e497222b3a79?t=1794663664276. The user has returned to visual work, superseding the earlier pause on redesign. Keep the current working NEAR, object-comparison and acoustic engines, and replace the confusing presentation and navigation around them.

Implemented on `design/variant-treasury-revamp`, based on `feat/near-tooling-testnet-rate-limit`, and merged into `main` as `ab53a45` after user approval. Retain existing branding until the user chooses otherwise.

The product is a shared NEAR treasury for teams that review and approve payments together. Its current release uses testnet native NEAR, browser-held signing keys, vault-scoped personal-object research checks and an acoustic member-listener ceremony. Object images do not create signing keys or establish identity; audio does not establish an unrelayable same-room boundary. Redesign must preserve these distinctions and all transaction safeguards.

## Reference observations

Retrieved the shared page and its embedded design HTML, and rendered the latter in Chromium. The reference is a botanical editorial invitation, with:

- Near-black green background `#070908`, ivory text `#f8fcf8`, muted green `#8a968f`, sage `#7eb87b` and warm gold `#d9ce8a`.
- Cormorant Garamond display headings and Inter utility/body text.
- Oversized centered hero typography, layered organic forms, thin rules, asymmetrical editorial columns and restrained outlined actions.
- Slowly drifting artwork, roughly 20–25-second cycles.

Adapt its visual language into original product compositions. Do not copy wedding content, external source code or botanical artwork. The reference lets artwork obscure the headline and hides its header on narrow screens; our version must keep text, navigation and actions legible and available.

## Approaches

1. **Reskin the current seven-task navigation.** Smaller scope but retains the mismatch between setup, objects, payments and approvals. Rejected because the user explicitly wants the working flow revamped after identifying this confusion.
2. **Reorganize presentation around the vault and payment lifecycle. Recommended builder choice.** Use the reference's visual direction throughout, consolidate existing tasks into understandable categories and preserve the engine interfaces. More UI work, but addresses both appearance and navigation.
3. **Replace the transaction/account architecture.** Out of scope: unnecessary for this visual and UX request, and adds protocol risk unrelated to the reference.

## Visual system

Use Tailwind and existing React/Vite tooling. Near-black surfaces, ivory primary text, legible muted text, sage selection/success accents and gold emphasis. Use slightly lighter surfaces to separate inputs and panels, with hairline boundaries where useful rather than nested outlined cards. Verify actual contrast after rendering; do not assume reference colors are accessible at every size.

Cormorant Garamond is reserved for marketing display text, page titles and selected editorial moments. Inter remains the font for controls, instructions, tables, account IDs and payment review. Amounts use stable tabular numerals. Full account IDs remain readable and copyable. Self-host fonts if obtainable and permitted; include good fallbacks and no font-dependent layout assumptions.

App page titles about 28–36px; marketing titles use responsive display sizing. Body 14–16px, mobile form inputs at least 16px. Buttons at least 44px in both actionable dimensions, with explicit primary/secondary/quiet/destructive styles, visible focus, disabled and pending states. One primary action per current decision. Rounded corners restrained (approximately 6–12px), rather than large pills on every surface. Status never depends on color alone.

Original visual motifs replace the leaves: overlapping vault seals, acoustic wave rings and abstract personal keepsake contours. Treat these as decorative, not as verification badges. Build with original CSS/SVG artwork suitable for the existing app; no new 3D library needed. They may overlap each other but not obscure essential text or controls.

## Landing page

Default `/` becomes the landing page. `/landing/` remains an alias. `/treasury/` remains the working app. Preserve legacy root task hashes and any receipt/session links by routing recognized existing app hashes to the treasury rather than stranding them on marketing.

1. **Hero:** compact navigation, product descriptor, large serif headline such as "Shared funds. / Considered together.", concise purpose, prominent Open treasury CTA. Original sage/ivory/gold forms drift around the perimeter. Clearly mark NEAR testnet. Keep camera/microphone permissions off on this page.
2. **Editorial introduction:** reference-style asymmetric columns, with compact facts on the left (team approvals, built-in devices, testnet) and the purpose stated on the right. No unsupported promises about theft prevention or USDC availability.
3. **Animated product walkthrough:** three chapters, each with a simplified rendering of the actual UI components: (a) create/select account and assemble the vault, (b) add members/enroll an object and prepare a payment, (c) fresh scan, acoustic exchange, explicit member approvals and confirmed receipt. On desktop a preview can remain sticky while chapter text scrolls. On mobile put each preview next to its explanation in normal flow. Use visible "Illustrative walkthrough" labeling and example data, never pretend to perform live chain writes, real inference or microphone capture.
4. **Practical capabilities and limitations:** readable concise explanations, with detailed technical limits in an accessible disclosure. Necessary custody information stays visible at onboarding and signing decisions.
5. **Closing CTA:** reference-style spacious composition with a direct route into the real app.

The walkthrough uses reusable presentational components also used by the app, with explicit illustration mode. It must not mount engine controllers or side-effectful account/payment forms. UI changes propagate to the preview through shared components, without duplicate business logic.

## Working app information architecture

```text
Header: product | selected vault | network | current account

Overview
Payments
Members
Vault settings

Account & device: utility entry, always reachable
```

Onboarding is a dedicated task, not the first numbered destination in a seven-step permanent menu. Without an account, show Create account / Use saved account as two clear paths. Explain browser-held keys before the user authorizes session/key creation. Keep the explicit browser-session authorization if current tests and custody behavior require it; present it within the selected path with clear wording. Remote demo users are choices for membership and recipients, not usable local signers without their local keys.

Once an account is selected, offer Create vault / Open vault. Vault setup groups name, member selection and approval policy into purposeful steps, retaining exact account IDs for review. Existing member selection from the shared demo directory remains available, with refresh/empty/error states and manual-ID fallback. Show object enrollment as the signed-in member's vault setup task, not a mysterious global feature.

Overview shows only available real vault data and concrete next actions: fund, finish member setup, or prepare payment. Do not fabricate totals, global approval queues or remote-device readiness. If the current engine requires a payment/session ID to open a request, keep a clear "Open payment request" action rather than pretending the app indexes every request.

Payments contains preparation, exact review, the active approval ceremony and completed receipts. New payment and Open request are visible entry actions. Show existing known records with Pending/Completed views only where real data supports them; do not invent historical records or notification counts. Review displays full recipient, exact amount/asset, purpose and approval requirement before signing.

Members contains the roster, the current member's object registration and the existing governance path for member changes. It must never imply a new member was added before the on-chain governance action confirms. Settings contains policy and recovery/governance actions and clearly distinguishes high-impact controls.

Historical account/object/payment/approvals/activity/settings hashes remain supported, mapped into the new categories. Use actual history entries for user navigation, handle Back/Forward, retain canonical links, and keep step state separate from page navigation.

## Connected flow

```text
Landing → create/select local account → create/open shared vault
        → select members and approval policy → enroll your personal object
        → vault overview → fund vault → prepare payment → review exact details
        → fresh object comparison + host/listener acoustic ceremony
        → each member explicitly signs approval → quorum/ready to execute
        → execute → reconcile chain outcome → confirmed receipt → share
```

Returning users select their saved local account and open a vault without repeating enrollment. Object templates remain local and scoped as implemented; do not imply cross-device recovery. A different device may need its own setup. The tested member-listener ceremony remains the contract flow; no separate external-recipient challenge is introduced.

Role-specific instructions explain what to do on each device. Hosts start/emit; listening members start listening and respond through the existing challenge flow. Only display remote presence/readiness when observed from actual data. "Ask your partner to tap Listen" is acceptable; an invented "Partner is listening" state is not.

An object comparison result retains the current research threshold semantics and limitations; this redesign does not recalibrate the model or convert a heuristic match into identity/security confidence. Existing object verdicts and acknowledgment rules remain covered by tests.

## Motion and responsiveness

- Hero artwork uses transform/opacity with long, low-amplitude cycles on separate decorative layers. No pointer tracking required.
- Walkthrough chapter changes use short crossfades and restrained positional reveals. Scroll selects the illustration chapter; it does not gate access to content or hijack scrolling. Support pause/replay or a static accessible alternative for the animated demonstration.
- Live interface transitions approximately 120–220ms; stable functional data, no stagger on repetitive actions, no animation delaying signing or keyboard navigation. Preserve interruptibility and focus.
- Pending, submitted, unknown, rejected and confirmed remain visibly distinct. No completed checkmark or celebration before verified success. On reload preserve and reconcile the original pending operation rather than creating a duplicate.
- Reduced motion removes drift, parallax and sequential motion; all copy and final explanatory states remain accessible. Pause offscreen/hidden decorative work.
- Desktop uses compact contextual navigation; mobile uses a compact header and accessible navigation without seven giant tiles or labels cut off. Preserve safe areas, keyboard access, camera preview sizing and visible primary actions. No hover-dependent controls.

## Integration boundaries

Primary changes: `web/src/landing`, `web/src/design`, `web/src/engines/app` presentation/navigation, route mapping, existing object/device/acoustic screen presentation and `web/src/styles.css`.

Preserve business logic in NEAR engines, durable operation journal, signing authorization, contract adapters, inference workers, media controllers, object template persistence and receipt verification. Shared presentation components accept data/callbacks; do not duplicate authority checks in visual layers or introduce mock engine fallbacks.

Restyle supporting routes (`/device-check/`, `/object-registration/`, `/acoustic-check/`, `/board/`, `/workspace/`, `/design/`) coherently and maintain their existing functional entry points. Legacy workspace remains a secondary/advanced route, not a competing default app. Unknown-route and read-only/shared receipt states use the same system.

## Acceptance checklist and release order

Release this as one integrated redesign feature with internal implementation phases; manual user sign-off follows the integrated release, not every styling file.

- [x] Written design approved, implementation plan recorded, failing behavioral tests added before new behavior.
- [x] Landing and treasury use one coherent reference-led visual system at desktop and mobile widths.
- [x] Landing provides original animated motifs and accurately labeled shared-component walkthroughs, reduced-motion/static access and no device permission or signing side effects.
- [x] Account creation/selection, vault setup, demo member/recipient choices, enrollment, funding, payment review, acoustic approvals, execution and receipts remain connected to existing engines.
- [x] Global navigation groups functionality correctly; legacy links and browser Back/Forward work.
- [x] Exact amounts/IDs, custody consent, security disclosures, request reconciliation and duplicate-submission safeguards are preserved.
- [x] Keyboard focus, semantic navigation, touch targets, long IDs, narrow screens, loading/error/empty/expired/unknown states verified with appropriate tests.
- [x] Run relevant unit/integration tests, complete browser regression suite, typecheck, production build and production route checks. Distinguish fixture coverage from live testnet verification.
- [x] Inspect rendered desktop/mobile screenshots and actual motion, including reduced motion. No claimed physical camera/audio success based on simulated media.
- [x] Provide local laptop/phone URLs and exact two-device manual steps, plus honest remaining coverage limits. Wait for user results before further feature work.

## Builder decisions

The builder may choose exact composition, responsive breakpoints, motif geometry, component extraction and a lightweight animation implementation using existing browser APIs. Do not install a motion library merely for predetermined transitions. Use the installed Emil design/motion/mobile skills and Superpowers planning, TDD and verification guidance. New transaction capabilities, protocol rules, asset support or custody mechanisms require separate scope.
