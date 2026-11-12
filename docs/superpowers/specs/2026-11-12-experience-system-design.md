# Shared treasury experience system

Status: design and implementation plan approved on 2026-11-12. UI implementation is present; physical-device/manual acceptance is pending.
Date: 2026-11-12
Working product label: Team Treasury. This is not a final brand-name decision.

Visual proposal: [editable desktop/mobile design board](2026-11-12-experience-direction.svg). The board is a static design artifact, not product implementation. Its typography currently uses local fallbacks; the named self-hosted font families are specified for implementation.

Independent builder check: completed on 2026-11-12; no important unanswered planning questions reported.

## Intent

Create one recognizable visual language for the landing page, real device checks, and future object enrollment and team treasury approvals. Serve teams approving treasury payments together, including people unfamiliar with wallets. The interface should communicate what the team is deciding, who has approved, and what actually happened to the payment.

The requested deliverable is an editable design specification, reusable Tailwind tokens and React UI components, original visual assets, and a responsive UI reference page. The reference page is a component catalogue and motion study, not a simulated wallet. It must clearly label illustrative payment states and must never fabricate a working transfer.

The user requested professional, sufficiently bright color; mobile and laptop layouts; deliberate motion and interactions; and careful treatment of trust during transfers. Use installed Emil design, animation, choreography, mobile, and performance guidance. Continue the existing React/Vite/Tailwind stack.

## Research and references

Sources below are design references, not dependencies or assets to redistribute.

| Reference | Observed | Adopt | Adaptation |
| --- | --- | --- | --- |
| User-supplied research poster | Fine grid, halftone shape, blue-to-dark field, warm edge glow, technical labels | Precise alignment and a restrained warm/cool material palette | Keep texture away from text; avoid its low-contrast body copy and dense treatment |
| User-supplied Co-Star screens | Spacious editorial typography, small tactile monochrome objects, quiet dividers and navigation | Generous rhythm, a meaningful sculptural asset, limited serif display type | Use legible sans-serif for actions, amounts and account identifiers; do not copy celestial assets |
| User-supplied Cash App screens | Prominent amount, large touch targets, recipient selection sheet, explicit success and receipt actions | Direct money hierarchy and clear outcome text | Use cobalt as the primary action color; green is a semantic outcome color |
| [Motion reference](https://cdn.recent.design/items/xj080k0/0/1080x1920.mp4) | A 1080 × 1920, 19.495-second recording. A particle overview relates to horizontally selected luminous cards. A selected card expands into detail, with continuity when returning | Maintain selection context and a consistent visual anchor between overview and detail | Do not put a particle ring, changing category colors, or animated amounts in the payment decision surface |
| [TypeSafe](https://typesafe.ai/) | Large typographic statements, textured color atmosphere, a technical interactive illustration and strong section changes | Message-led landing hierarchy and one explanatory visual | Avoid making oversized copy, loading sequences, novelty panels, and texture compete with the main action |

Inspection: the video was downloaded to ignored local research storage, decoded with local Chrome and sampled across its duration. TypeSafe desktop and mobile renders were captured with Chrome; a second mobile capture verified the top of the page at scroll offset zero. Its small-screen hierarchy remains highly typographic, with a reduced navigation and stacked statement. Reference easing and transition durations have not been measured; the values below are our own specified tokens from the installed animation guidance.

## Approaches and recommendation

1. **Editorial banking — recommended builder call.** Light canvas, deep ink, cobalt actions, pale blue planes, small coral accents, spacious editorial headlines and a tactile shared-frame illustration. Readable enough for money decisions and distinctive enough for a landing page.
2. **Technical control room.** Dark surfaces, denser grids, luminous status panels and particles. Stronger connection to the research poster and video, but makes experimental technology more prominent than the team's decision.

The user delegated design execution and specified the desired character. The user approved approach 1 and this document on 2026-11-12.

## Goals, boundaries, and anti-goals

- Establish a shared foundation for mobile and desktop, not independent themes for each reference.
- Make state, amount, recipient, asset, network, fees and signer policy legible in future payment screens.
- Make motion explain a relationship or a state change. Never require animation completion before a visible action works.
- Keep object-only access explicitly experimental. Do not imply a photograph is a cryptographic secret.
- Describe sound as acoustic participation checking, with replay/relay limits. Do not claim sound guarantees everyone is in the same room.
- Use built-in device capabilities only. No external hardware requirements.
- Do not implement wallet access, treasury contracts, signing, or transfer behavior in this design phase.
- Do not change the shipped readiness controller or its permission lifecycle as a side effect of visual work.
- Do not introduce invented balances, people, approvals, transaction hashes, on-chain receipts, fake audio meters or timed success into the working application.
- The current feature's physical-device acceptance remains pending. Design work is authorized; the next functional feature still waits for those results.

## Foundations

### Color

| Token | Value | Role |
| --- | --- | --- |
| canvas | `#F7F9FC` | Page background |
| surface | `#FFFFFF` | Content cards and reading surfaces |
| ink | `#14263D` | Primary text and dark feature panels |
| muted | `#53657B` | Secondary readable text |
| line | `#D1DCEB` | Decorative separators, not the sole boundary of an input |
| cobalt | `#245BDB` | Primary actions, active navigation and focus |
| cobalt-strong | `#1947B5` | Primary hover/pressed background |
| sky | `#DDEBFF` | Quiet emphasis, selected surfaces and illustration planes |
| coral | `#F58E7A` | Small editorial/illustration accent, never a success indicator |
| coral-tint | `#FFF0E9` | Warm explanatory surface |
| success / success-tint | `#126847` / `#E8F6EE` | Confirmed positive outcome, with text and icon |
| warning / warning-tint | `#805400` / `#FFF3D6` | Waiting, blocked or uncertain state, with specific text |
| danger / danger-tint | `#B4333D` / `#FDECEF` | Error/rejection, with recovery action |

Calculated sRGB contrast: white/cobalt 5.84:1; ink/canvas 14.49:1; muted/white 5.97:1; muted/canvas 5.66:1; success pair 6.09:1; warning pair 5.98:1; danger pair 5.29:1. Recheck actual composed surfaces and focus/control boundaries in implementation. Gradients are illustration backgrounds, never body-text backgrounds. Do not lower functional text opacity.

Use primarily light surfaces with bounded dark ink illustration panels; do not ship a second dark theme this phase. Restrict coral to small accents so cobalt remains recognizable. Color supports, but never replaces, text and icon meaning.

### Typography and spacing

- Functional type: self-hosted Inter variable, with the existing system sans stack as fallback. Obtain from its official source, preserve license, and use `font-display: swap`.
- Editorial type: self-hosted Newsreader variable, with Georgia fallback. Use for the large landing statement and occasional editorial section titles, never amounts, identifiers, controls, errors or receipt data. Preserve its upstream license.
- Mono: existing system monospace for short receipt labels/technical annotations, not paragraphs.
- Desktop display 72–88px; mobile 42–48px; display line height 1.04–1.12. Section headings 28–40px. Body 16px/1.6; supporting text 14px/1.5; labels at least 12px. Input font size at least 16px.
- Amounts use tabular lining numerals, full precision where needed, explicit asset and network labels. No rolling digits or animated balance counters.
- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 48, 64, 96px. Reuse rather than hand-adjust each section.
- Radius: controls 12px, cards 20px, feature/illustration frames 28px; pills only for statuses and compact tags.
- One subtle static shadow scale. No continuously animated shadows, animated blur, or translucent text surfaces.

### Responsive layouts

- Tailwind breakpoints: 640, 768, 1024 and 1280px. Max content width 1248px; desktop gutters 32px; mobile 20px (16px at 320px if needed).
- Landing: two-column statement and illustration at 1024px+, one column on mobile with copy and primary action before the visual. Avoid mandatory full-screen hero height; use stable `svh` only if a minimum is needed.
- Device checks: retain real controls and status text; one column on mobile, three columns on laptop. Apply the foundation through reusable primitives without touching media behavior.
- Payment reference: single reading order on mobile; summary plus approval detail at laptop widths. Preserve amount/recipient position across status states. No hover-only information.
- Touch actions: at least 44 × 44px, primary actions usually 48px high. No custom numeric keyboard in this phase; future amount fields should first use native decimal input.
- Browser zoom remains enabled; 200% zoom and 320px widths must reflow. Long identifiers wrap without clipping or hiding distinguishing characters. Addresses remain copyable.
- Add viewport safe-area metadata/padding where necessary, `dvh` for bounded app surfaces, and pointer-aware hover. Do not disable document scrolling or pull-to-refresh on the landing page.

## Message and screen composition

### Landing

Working headline: **One decision. Made together.**

Supporting copy: “A shared treasury for teams that want to review payments together. Exploring personal-object access and acoustic participation on NEAR.”

Primary CTA: **Check your device**, linked to the real readiness check. Secondary anchor: **How it works**. A visible “Research prototype” label sets the product's current stage. Do not advertise working wallet/transfer capabilities until they are integrated and verified.

Page order:
1. Quiet navigation and working product label.
2. Headline, concise explanation, real CTA and original shared-frame illustration.
3. Three-step explanation: recognize your object / review the same proposal / approve and track confirmation. Mark these as the planned workflow.
4. A plain explanation of what sound adds and what it cannot establish.
5. Device-readiness CTA and restrained footer.

Do not include an invented customer-logo wall, regulatory badges, bank insurance, fabricated metrics, fake testimonials, or security certification.

Text sketch:

```text
LAPTOP
Team Treasury                    How it works       Check your device

RESEARCH PROTOTYPE               [two material frames sharing one center]
One decision.
Made together.
Short explanation.
[Check your device] [How it works]

01 Your object        02 One proposal        03 Team approval

MOBILE
Team Treasury                         [Check device]
RESEARCH PROTOTYPE
One decision.
Made together.
Short explanation.
[Check your device                    →]
How it works
[shared-frame illustration]
01 → 02 → 03 explanation, vertically
```

### Editable UI reference page

Proposed route `/design`, with source `web/src/design/ExperienceReference.tsx`. It documents tokens, type, buttons, status labels, disclosure/error panels, responsive summary layouts and a bounded motion study. Static payment-state specimens are persistently labelled “Design reference — no transaction.” Use template fields (amount, recipient, approved count), not plausible fake treasury data. State selection is labelled “Inspect state,” never “Send” or “Approve.” It must not call a blockchain, microphone or camera or ask for permissions.

### Original asset family

- **Shared frame:** an original layered SVG illustration of two rounded material frames meeting at one shared center. Cobalt outer structure, ice-blue inner plane and restrained coral edge. Represents independent people reviewing one proposal. It must not resemble an external physical key/tag the user needs to purchase.
- **Object study:** a simple original tactile abstract object silhouette and camera framing marks for explanatory content. No claim that a pictured object is enrolled or verified.
- **Signal bridge:** two labelled endpoints connected by a few sparse wave paths. Use for explanation; actual listening state must later reflect actual acoustic input, never a decorative waveform masquerading as measurement.
- Export separate editable SVGs and a manifest explaining role, alt text, light/dark-background usage and which layers may move. Use locally rendered gradients/shadows rather than a WebGL scene or autoplay video in the application.
- Keep the mark/wordmark provisional. Do not turn a research image or another product's symbol into our logo.

## Motion contract

Purpose comes before effect. Use CSS transitions for press/state feedback and CSS or WAAPI for bounded explanatory scenes. No motion-library dependency is needed for the approved first scope. Use the existing token system rather than parallel values. Keyboard-triggered UI changes are immediate. Hover feedback is gated by hover + fine pointer.

Tokens: press 120ms; status fade 160ms; content entrance 220ms; optional detail panel 260ms; explanatory illustration 560ms. Ease-out `cubic-bezier(0.23, 1, 0.32, 1)`; on-screen motion `cubic-bezier(0.77, 0, 0.175, 1)`; drawer `cubic-bezier(0.32, 0.72, 0, 1)` if later required. Animate only transform/opacity for the first scope. Dynamic interactions use retargetable transitions; do not restart entry keyframes on rapid changes.

| Element | Role | Starts | Duration | Motion | Relationship |
| --- | --- | --- | --- | --- | --- |
| Headline, copy, CTA | Static | Initial render | — | Visible immediately | Main message and action never wait for animation |
| Shared-frame group | Lead | In view, once | 560ms | Two illustration layers settle by at most 12px, fade | Together; explains a shared center |
| Illustration annotation | Support | 80ms | 220ms | Opacity | Overlaps the frame; not essential information |
| Status label in specimens | Lead | Explicit state selection | 160ms | Opacity only | Amount, recipient and layout remain static |
| Pointer press | Feedback | Pointer down | 120ms | Scale to .98 | Immediate; no transfer side effect |

For explanatory replay use an explicit Replay button; no indefinite particle loop. On repeat, cancel in-flight work before replay. Keep controls interactive throughout. Offscreen/hidden-tab visuals stop. Reduced motion presents the final illustration immediately, without displacement/delay, and keeps only short opacity feedback. A static render must remain complete if animation fails or JavaScript is slow.

Deliberately static: amounts and asset labels (readability), recipient/account identifiers (comparison), signer order (auditability), decision buttons (reliable target), reading text (immediate comprehension). No particle/3D effects behind an approval button. No celebration before chain confirmation.

### Future payment states — design specification only

| State | Evidence/trigger | Required message/action |
| --- | --- | --- |
| Review | Proposal fetched and identified | Amount, asset, network, recipient, fees, signer policy; review action |
| Participation check | Fresh challenge in progress | Explain mic/speaker use; cancel available before submission |
| Approval recorded | That signer's approval is actually recorded | “Your approval recorded”; show remaining required signers; do not imply payment sent |
| Ready to submit | Required approvals satisfy current policy | Explicit submit/release action, if the actual contract requires one |
| Submitted | Transaction hash received | “Submitted to NEAR”; explorer link; no settled checkmark |
| Confirmed | Expected successful on-chain result verified | “Payment confirmed”; receipt including transaction ID and network |
| Rejected / expired | Actual rejection or proposal expiry | Specific reason and safe recovery; invalidate stale action |
| Outcome unknown | Connection lost after possible submission | “Checking transaction status”; reconcile original transaction before any retry |

Animations never advance this state machine. Exact policy, NEAR finality query, submission ownership and idempotency will be designed with the functional feature, not guessed during UI work. Post-submission “Close” only dismisses the view; it must not be presented as canceling a transfer. Sound completion is not payment success.

## Build scope and files after approval

1. Shared foundations: `web/src/design/tokens.css`, `tokens.json`, typed primitives, original SVG assets under `web/public/assets/experience/`, asset manifest and font licenses.
2. A responsive `/design` reference page plus a message-led landing page. Preserve the real readiness page at a dedicated path and link to it from the CTA. The exact route change must keep existing device tests targeting the real readiness page.
3. Apply foundation tokens to readiness UI without changing its controller behavior. Test navigation away stops active inputs. Do not remove genuine checks to make the screens more photogenic.
4. Add focused browser tests before new UI behavior, test reduced motion, repeated interactions, keyboard access, overflow and actual link destinations. Run the existing real-media tests as regression coverage.
5. A manual visual/touch checklist and design usage documentation. Publish the preview privately and commit in coherent phases on a separate branch. Keep the existing readiness PR unmerged until its manual acceptance.

This is a staged UI foundation release. It does not count as shipping object authentication or payments. No backend, wallet, acoustic transport or smart contract is required for the design catalogue. No analytics or remote asset calls are needed at runtime. If a generic overlay becomes necessary, use a proven accessible primitive rather than a hand-rolled gesture/focus system; a reference layout does not justify installing one now.

## Verification and acceptance

- Semantic text/control color pairs pass WCAG AA normal-text contrast. Focus and input boundaries are checked separately; all errors have readable labels.
- Browser tests at 320, 390, 768, 1024 and 1440px; no horizontal document overflow. Include 200% zoom equivalent/reflow and worst-case long labels/identifiers. Verify visible primary actions and comfortable touch targets.
- Landing CTA reaches real readiness controls. The reference page never requests media or represents a fake transfer as completed. Existing permission denial, retry, reset and speaker confirmation behavior stays tested.
- Prefer stable regions rather than animating layout. Check rapid Replay/state selection, visibility changes, keyboard switching and reduced motion. Record and scrub animation once at normal speed and once at 4× duration for choreography review.
- Automated rendering and CPU stress can find regressions; they do not certify 60/120fps, mobile Safari, physical sensors or touch feel. Manually test one physical phone and one laptop before claiming acceptance. Include slow-device and connection-loss scenarios when actual transfers are implemented.
- Independent design-builder check before approval; final code review after implementation. No claims of security or performance beyond observed evidence.

## Decisions still intentionally deferred

Final brand name/wordmark, object matcher/enrollment, acoustic protocol, wallet/contract policy, real proposal data and real settlement integration. These do not block building the UI foundation. Builder may settle exact SVG geometry, section copy length, responsive spacing within the scale, and component file splits. Changes to payment security assumptions require a separate functional design.

## Track review after approval

The user additionally requested comparison with the Social Money, Open Innovation and Real-World Money starter prompts. See [track alignment and implementation evidence](../../hackathon/track-alignment.md). This review does not expand the approved UI phase into a wallet, invoice processor or new multisig. The UI must accommodate an existing treasury's real approval policy, including automatic execution on a decisive vote, and must distinguish an illustrative design specimen from live NEAR integration.
