# Feature 01 — manual device acceptance

Status: user confirmed camera, microphone and speaker happy-path checks on 2026-11-12. Additional physical-device cases remain unverified.

This release tests device access. It does not create a wallet, recognize an object, decode proximity audio, or execute a payment. All capture data is held in memory on the device, with no application upload or storage path.

## Run or open

Open the private HTTPS preview: the root now opens this feature directly. `/device-check/` is an equivalent direct link. Locally, `npm ci --prefix web` and `npm run dev --prefix web` serve `http://127.0.0.1:5173/`. Visual work is paused; the earlier landing page is retained at `/landing/`.

Phones need the HTTPS preview. A plain HTTP LAN address does not provide a secure camera/microphone context. Keep the private preview in a full browser tab and sign in if its access gate requests it.

## Check on a laptop and a phone

1. **Initial state:** page shows three unchecked cards and “0 of 3 checks confirmed.” No permission prompt or active camera/microphone indicator appears automatically.
2. **Camera:** start and allow access. Verify the preview is live by moving an ordinary non-sensitive object. Capture a frame; inspect its clarity. Stop the camera and verify the browser/OS indicator turns off. Discard the frame; it must disappear.
3. **Microphone:** start and allow access. Speak or clap gently. Verify the meter changes with actual input and the check confirms only after input is detected. Stop and verify the permission-use indicator turns off. There must be no microphone playback or feedback through speakers.
4. **Speaker:** choose low device volume and play the tone. The app should ask whether you heard it; it must not confirm merely because playback ended. Confirm only if you heard it. Otherwise try again, checking mute state and audio output/headphones.
5. **Reset:** after one or more checks, reset. Captured frame and check count clear, audio ends, and camera/microphone indicators turn off.
6. **Denial/retry:** deny camera and microphone separately using browser settings. Each check should show an actionable failure without confirming. Re-enable permission and retry.
7. **Cancel a prompt:** start a sensor with permission still undecided, then use Stop/Reset. If you subsequently allow the old request, no preview or input should reactivate. If the browser shows a transient access indicator while resolving its dialog, it must turn off promptly.
8. **Leave/return:** switch tabs/apps while checks are running, then return. Checks reset and devices are off. Close/reload the page and verify no capture remains.
9. **Layout/accessibility:** inspect portrait phone layout and desktop; use keyboard Tab/Enter. Controls should remain visible, focused clearly, and reachable without horizontal scrolling.

Record browser/device versions, pass/fail per step, and the exact error wording. Use non-sensitive objects; do not send personal captures to report a failure. A description is enough.

## Automated evidence

- Current release: `npm run check --prefix web` passed 10 unit tests and 17 real-browser tests, plus TypeScript and production build.
- A new home-entry flow test failed before the routing change, then passed: open app, verify no camera/mic access, play real Web Audio, require explicit audibility confirmation, reset to zero.
- Existing device checks cover idle startup, native browser permission denial/retry, native Web Audio, explicit confirmation/reset and phone-width layout. Additional regression checks cover navigation/history cleanup, static routes and retained visual references.
- The device controller and media helpers are unchanged from the independently reviewed implementation. Physical capture and hearing were not established by that review or by automated confirmation.

No fake media flags, injected streams, mocked getUserMedia, mocked responses, or simulated success states were used. Native browser permission controls were used to exercise denial. Automated confirmation exercises the button behavior; it does not establish that a human physically heard the tone.

## Manual feedback and remaining evidence

On 2026-11-12 the user reported: “yes the three device is checked.” Treat the three primary checks as manually accepted, with no reported failure. The message did not identify device/browser versions or establish completion of every step above.

Phone and laptop coverage, browser versions, canceled permission prompts, denial/retry, tab suspension, reset and OS privacy indicators still need explicit evidence. They are not covered by a generic “all tests passed” claim.

The happy-path feedback permits preparing Feature 02. Its design and implementation remain separate from this acceptance record.

For a quick happy-path check, capture a frame and stop the camera without discarding it, detect microphone input and stop it, then confirm the speaker only if heard. The count should reach 3 of 3. Reset should return it to 0 and remove the capture. Discarding a capture intentionally clears camera confirmation.

## GitHub automation status

The current GitHub credential cannot create Actions workflows. The proposed workflow is retained as `github-actions.example.yml` in this directory; it is not an active CI run. Local automated checks passed. Activating GitHub automation later requires an appropriately authorized credential and moving the template into `.github/workflows/checks.yml`.
