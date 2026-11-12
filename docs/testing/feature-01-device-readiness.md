# Feature 01 — manual device acceptance

Status: ready for manual testing; physical-device acceptance is pending.

This release tests device access. It does not create a wallet, recognize an object, decode proximity audio, or execute a payment. All capture data is held in memory on the device, with no application upload or storage path.

## Run or open

Use the private HTTPS preview supplied with the release. On the development laptop, `npm ci --prefix web` and `npm run dev --prefix web` serve `http://127.0.0.1:5173/`.

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

- 8 pure-behavior tests passed after an observed failing run for error classification and RMS measurement.
- 4 running-Chrome integration tests passed after an observed missing-feature failing run.
- Browser checks cover idle/permission-free startup, native permission denial, native Web Audio plus explicit confirmation, reset, and phone-width layout.
- TypeScript check and production build passed.
- Independent read-only reviewer found no critical or important implementation defect. It independently reran unit tests/typecheck, without invoking sensors.

No fake media flags, injected streams, mocked getUserMedia, mocked responses, or simulated success states were used. Native browser permission controls were used to exercise denial. Automated confirmation exercises the button behavior; it does not establish that a human physically heard the tone.

## Pending evidence

Successful physical camera/microphone capture, phone Safari/Chrome behavior, speaker audibility, canceled permission prompts, tab suspension, and OS privacy indicators require the manual steps above. They are not covered by a generic “all tests passed” claim.

Feature 02 waits for the user's feedback on this checklist.

## GitHub automation status

The current GitHub credential cannot create Actions workflows. The proposed workflow is retained as `github-actions.example.yml` in this directory; it is not an active CI run. Local automated checks passed. Activating GitHub automation later requires an appropriately authorized credential and moving the template into `.github/workflows/checks.yml`.
