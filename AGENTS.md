# Project working agreement

## Scope and privacy

Build a new NEAR team treasury product. Use built-in device capabilities only. Keep public documentation focused on this product. Product branding remains undecided.

The approved direction is object-only research sign-in and acoustic team approval. Do not claim that object images are cryptographic secrets or that browser audio establishes an unrelayable same-room proof.

## Feature checkpoints

- Functional features take priority. Visual redesign and the dithered motion concept are paused until the user returns to them. Use the existing straightforward screens for feature releases.
- Implement one feature at a time, with a written acceptance checklist.
- Add meaningful failing tests before application behavior; run the full relevant suite after implementation.
- Use real APIs and integrations. Do not represent mocks, fake media, dry quotes, or placeholder states as completed functionality.
- Name the limits of automated coverage. Physical device behavior requires manual verification.
- At each feature release, give the user exact manual steps and wait for their results before beginning the next feature.
- Fix reported failures in the current feature before extending the flow.
- Consult installed Superpowers planning, TDD, debugging, and verification skills as applicable. Existing user decisions take precedence; do not repeatedly reopen them.

## Git and GitHub

- Use a private development repository until publication is explicitly needed.
- Make cohesive phase commits, not a commit per file or command.
- Commit scaffolding/dependency lockfiles as one foundation change; feature behavior and its tests form another coherent change.
- Use branches and reviewed pull requests for feature work. Never force-push or rewrite user history.
- Run appropriate checks before commits, pushes, and completion claims. Do not claim checks ran when they did not.
- Never commit secrets, local certificates, raw captures, generated test reports, dependencies, or build output.
- Keep exploratory conversation notes out of the published application.

## NEAR development tools

Official NEAR skills near-api-js, near-dapp and near-smart-contracts are installed locally; use relevant guidance while preserving the session's explicit product/custody decisions. Pinned sources and setup: [NEAR tooling guide](docs/testing/near-tooling-and-testnet.md). The `near_testnet` project MCP is read-only/testnet-only. Never import or expose browser/CLI signing keys to it. A helper HTTP 429 is a faucet quota issue; preserve and reconcile the original account/key, respect provider cooldowns, and do not rotate services to evade rate limits.
