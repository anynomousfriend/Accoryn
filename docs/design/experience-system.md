# Experience system usage

The approved direction uses cobalt actions, ink text, pale-blue surfaces and small coral accents. Green represents a confirmed positive outcome. Team Treasury is a working label; the final brand name is undecided.

## Source and routes

| Route | Purpose | Source |
| --- | --- | --- |
| `/` | Landing page and planned workflow | `web/src/landing/LandingPage.tsx` |
| `/device-check/` | Real camera, microphone and speaker checks | `web/src/App.tsx` |
| `/design/` | Editable component, status and motion reference | `web/src/design/ExperienceReference.tsx` |
| `/design/?content=long` | Labelled long-content reference | Same reference component |

Production builds emit actual HTML entries for the supported deep routes. They do not depend on a development-server rewrite. Navigation uses ordinary links; leaving readiness clears its media state.

## Foundations and components

`web/src/design/tokens.css` defines the runtime Tailwind theme and motion variables. `tokens.json` exports the approved foundations for design tools. Keep the JSON export consistent when editing the CSS source. Use semantic utilities such as `bg-canvas`, `text-muted`, `bg-cobalt` and `text-success` instead of choosing new per-screen colors.

Inter carries functional text; Newsreader is limited to editorial headlines. Both fonts are served locally. Their upstream SIL Open Font License files are retained in `web/public/fonts/`. Fallback text stays visible while fonts load. Amounts, identifiers, errors and controls use the functional face. Technical labels use system monospace.

```tsx
import { ActionLink, Button, StatusBadge } from './design/primitives.tsx';
import { SharedFrame } from './design/SharedFrame.tsx';

<ActionLink href="/device-check/">Check your device</ActionLink>
<Button variant="secondary" onClick={reset}>Reset</Button>
<StatusBadge kind="warning">Checking transaction status</StatusBadge>
<SharedFrame interactive />
```

Button and ActionLink accept native button/anchor props and `variant="primary" | "secondary" | "quiet"`. Button defaults to `type="button"`. StatusBadge accepts `kind="neutral" | "active" | "success" | "warning" | "danger"`, includes an icon and requires meaningful text. It does not establish or change application state.

The reference's `PaymentStudyState` belongs only to the labelled catalogue. Do not use it as an executable payment controller. Actual approval, submission and settlement transitions must come from verified integration results. An acoustic exchange never counts as consent or on-chain confirmation.

## Original assets

Files and usage metadata are in `web/public/assets/experience/manifest.json`:

- `shared-frame.svg`: editable standalone illustration for an ink background.
- `frame-cobalt.svg`, `frame-ice.svg`: independently movable composition layers.
- `object-study.svg`: an abstract object for explanatory content on light surfaces.
- `signal-bridge.svg`: a sender/listener diagram, not a live signal.

The artwork is original SVG geometry. No reference screenshots, videos or third-party logos are shipped. The abstract object is not an enrolled credential. The provisional frame mark is not a final brand decision.

## Motion contract

| Element | Role | Starts | Duration | Motion | Relationship |
| --- | --- | --- | --- | --- | --- |
| Shared-frame layers | Lead | First view or pointer replay | CSS token `--motion-explain`, default 560ms | At most 12px transform | Together toward a shared center |
| Button | Feedback | Pointer press | 120ms | Small scale | Immediate acknowledgement |
| Text, amounts, identifiers, decision targets | Static | Render | — | None | Readable and selectable |

SharedFrame reads the shared CSS duration/easing, cancels in-flight work before replay, and stops when offscreen, hidden, unmounted or reduced motion is enabled. A replay starts from the current presentation. Keyboard actions remain immediate. Reduced motion shows the complete artwork. No endless particles, rolling amounts, delayed CTA or artificial payment countdown is used.

The reference exposes the motion tokens, including a 160ms status-feedback budget for future applicable UI; its state inspection updates immediately. State text is never gated by a decorative timer.

## Review of the integrated UI

| Before | After | Why |
| --- | --- | --- |
| Green used for both live and confirmed states | Cobalt for active work; semantic green for confirmation | The distinction also has text/icon labels |
| Styling values chosen inside cards | Shared Tailwind theme and presentation primitives | Landing, real checks and reference share one foundation |
| Microphone meter changes width | Measured level drives `scaleX` | Retains real input while avoiding repeated layout work |
| Deep links depended on a dev fallback | Explicit routes plus built entry files | Direct links and reloads load the intended page |
| Decorative motion continued outside its viewport | Bounded motion with offscreen/visibility cleanup | Avoids unnecessary work and stale animation |

## Verification limits

Automated checks cover native permission denial, speaker confirmation, reset/navigation, real filesystem route output, keyboard input, semantic contrast, reflow and motion lifecycle. Chrome rendering is not physical phone acceptance or a frame-rate guarantee. Follow the [UI manual checklist](../testing/feature-ui-experience.md) and [real-device checklist](../testing/feature-01-device-readiness.md).

No object model, acoustic codec, wallet or NEAR transfer is integrated. See the [baseline experiments](../research/vision-audio-baselines.md) and [track roadmap](../hackathon/track-alignment.md) for later work.
