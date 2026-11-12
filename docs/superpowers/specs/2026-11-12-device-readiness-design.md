# Feature 01: Device readiness

Status: approved by the user on November 12, 2026 for the first manual-test checkpoint. Product name remains undecided.

## Intent

Before object enrollment or acoustic approval, let a person verify that their phone or laptop can supply the actual camera, microphone, and speaker access the product needs. This is a small foundation feature, not wallet creation or proof of proximity.

## Approaches

1. **Device readiness first (recommended):** a focused screen exercising real camera, microphone, and audio APIs. It finds compatibility problems before introducing recognition or blockchain behavior.
2. **Object enrollment first:** reaches the recognizable product idea sooner, but mixes capture, model loading, recognition, storage, and key-control failures into the first checkpoint.
3. **Treasury contract first:** tests the payment rule sooner, but does not resolve the user's reported device and audio reliability concerns.

The user selected and approved device readiness first.

## Scope and behavior

- Responsive standalone web screen. Neutral temporary label: “Team Treasury”; do not finalize branding without the user selecting a name.
- No camera/microphone permission request on page load. Buttons start each check separately through a user gesture.
- Camera: request the real camera, show its live preview, allow a still capture for checking framing, and discard the capture when cleared/reset or the page ends. No recognition result.
- Microphone: request real input and show a measured input level. Explain that a moving meter demonstrates received input, not sound decoding or proximity.
- Speaker: generate and play a short comfortable audible tone. Ask the person whether they heard it; playback success alone cannot establish audibility.
- Explicit states for idle, requesting, active/completed, denied, unsupported, and failed checks. A pending permission dialog is not a pass.
- Stop/retry/reset controls. Stop media tracks, detach video, cancel animation callbacks, and close/disconnect owned audio resources on stop/reset/page exit. Ignore or release late permission results after cancellation.
- No uploads, accounts, funds, wallet keys, geolocation, external hardware, or pretend balances. Sensor data stays in memory.
- Baseline works without accelerometers/gyroscopes. Optional sensor research belongs to a later feature.
- The browser must use localhost or HTTPS for capture. A phone cannot use a laptop's plain HTTP LAN URL for these permissions.

## Screen sketch

```text
Team Treasury                         Feature 01
Check your device
Before we build your shared treasury, check the essentials.

[Camera]        [Microphone]        [Speaker]
Live preview    Real input meter    Play test tone
Start / Stop    Start / Stop        Heard it / Try again

Your data stays on this device.        Reset checks
```

Visual direction: warm neutral background, dark green accents, generous spacing, clear status chips, keyboard-accessible controls, and a single-column phone layout. No decorative fake graphs or simulated sensor activity.

## Tests and release gate

Use test-first development for application behavior. Pure functions receive literal inputs without mocks. Browser tests exercise the running application. Do not use fake camera/microphone flags, injected successful permissions, mocked API responses, or synthetic “passed” states as proof of device readiness.

Automate the initial permission-free screen, input/error classification, speaker lifecycle where the browser permits real audio, reset behavior, viewport layout, and no unexpected uploads. Physical capture quality, speaker audibility, real microphone input, and permission prompts require a recorded manual checklist. Report unverified cases honestly.

Run the complete test suite, typecheck, and production build before committing the feature. Publish one reviewable feature checkpoint, provide manual instructions, and wait for the user's results before Feature 02. Keep the GitHub repository private during development.

## Implementation choices

Approved stack: Vite, TypeScript, React, browser MediaDevices/Web Audio APIs, Node's test runner for pure behavior, and Playwright for browser integration. The user subsequently selected Tailwind CSS and the Emil design-engineering skill for styling. Exact dependency versions will be resolved and locked after design approval. Use a private GitHub repository with a neutral technical name until branding is selected.

The six requested Superpowers skills are installed. The design approval step is being followed before scaffolding or dependency installation.
