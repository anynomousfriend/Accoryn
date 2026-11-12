# Contributing

The shared repository is [Accoryn](https://github.com/anynomousfriend/Accoryn). Existing history is on `origin/main`. Preserve that history and use feature branches and reviewed pull requests; do not force-push over another contributor's work. App-wide branding remains a separate decision.

Use a separate branch for each coherent feature or fix and open a pull request against the agreed integration branch. Keep commits grouped by useful phases: tested foundations, a working feature, or a focused fix. Do not push directly to the shared main branch. Coordinate changes to shared types, contract interfaces and package lockfiles in the PR.

## Run and verify

```sh
npm ci --prefix web
npm run dev --prefix web
npm run check --prefix web
```

Use Node 22.18+; the CI template targets Node 24. Local browser checks use Chrome on macOS. Linux needs Playwright Chromium and a virtual display for the native visibility test; see [testing guidance](docs/testing/feature-ui-experience.md). The Actions file is currently an inactive template, not a configured CI run.

For behavior changes, write a failing test first, observe the intended failure, implement the change, then run the relevant tests and full check. Use real APIs. Do not pass tests by injecting successful sensor/chain responses or by representing fake transfers as working features. Catalogue specimens must remain labelled as design references.

Each feature has a manual acceptance checklist. Record the commands actually run, remaining physical-device checks and any material limitation in the PR. Stop for the user's test results before starting the next functional feature. The user accepted the three readiness happy-path checks on 2026-11-12; additional permission/lifecycle cases and device/browser coverage are unverified. Visual redesign remains paused.

Never commit environment secrets, signing keys, private captures, certificates, model credentials, generated reports or build output. Keep application branding neutral until a name is selected. Respect font/model/library licenses and document external artifact provenance.

Current references: [working agreement](AGENTS.md), [approved UI plan](docs/superpowers/plans/2026-11-12-experience-system.md), [design system](docs/design/experience-system.md), [track roadmap](docs/hackathon/track-alignment.md).
