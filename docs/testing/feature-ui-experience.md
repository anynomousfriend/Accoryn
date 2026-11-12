# Experience system — manual acceptance

Status: physical phone/laptop acceptance is pending. Automated release results and independent review are recorded at handoff.

This release contains the landing page, original SVG assets, Tailwind foundations, component reference and real readiness checks. Payment states on `/design/` are explicitly labelled design references; they do not create a treasury or transfer funds.

## Open the release

Use the private HTTPS preview supplied with the release in a full browser tab. Start at `/`; the main action opens `/device-check/`. The UI reference is at `/design/`. Reload each route directly. Locally, `npm run dev --prefix web` serves these paths at `http://127.0.0.1:5173`.

## Phone and laptop checks

1. **Landing:** the main action is easy to find. “How it works” reaches the planned-workflow explanation. Text and illustrations stay clear in portrait/landscape, without horizontal page scrolling.
2. **Real readiness:** choose “Check your device.” Run the [Feature 01 checks](feature-01-device-readiness.md), including live capture, microphone input, audibility, denial/retry and pending-prompt cancellation. Confirm a tone only if you physically hear it.
3. **Leave during playback:** play the test tone, immediately open “UI reference,” then return with Back. No late confirmation or continued tone; readiness returns to zero. Repeat after confirming a tone. Check that camera/mic indicators turn off when leaving a running check.
4. **Reference:** inspect approval recorded, submitted, confirmed and unknown. Amount/recipient fields stay still. The page continues to say “Design reference — no transaction”; no real Pay/Approve action exists. Long content is readable and copyable.
5. **Motion:** replay twice quickly. No jump, accumulated motion or disabled control. Scroll the artwork away and return; old animation must not resume. Change tabs during playback and return. Inspect once at normal speed and once at 4× duration in browser animation tools.
6. **Reduced motion:** enable the OS Reduce Motion preference, including during playback. The complete illustration stays visible and does not travel when replay is selected.
7. **Keyboard:** Tab/Shift+Tab through links, controls and the native state selector. Focus remains visible; focusing a camera/mic control does not start it. Keyboard state selection updates immediately. Use the skip link once.
8. **Small screens and zoom:** check 320–390px-equivalent layouts and actual 200% laptop browser zoom. Open the long-content reference. No identifier, status, button or input becomes unreachable. Normal browser zoom remains available.

Record device/browser versions, step, expected result and actual result. Report in text; no private object photo or microphone recording is needed. The next functional feature waits for these results and outstanding real-device acceptance.

## Automated scope

Tests use real Chrome, native permission controls, real Web Audio, actual animation objects and real filesystem writes. No fake media devices, successful API stubs, injected streams or fabricated transactions are used. The visibility test uses a temporary native Chrome profile attached without Playwright's focus override; it does not replace document properties.

Linux needs a virtual display for that test: `xvfb-run -a npm run test:browser --prefix web`. The inactive Actions template includes this command; no active CI or expanded token scope is implied.

Narrow browser viewports verify reflow, not actual OS zoom, phone touch, safe areas, device audio quality or security. Those remain manual evidence. No 60/120fps or production-financial-security claim is made.
