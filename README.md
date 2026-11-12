# Team Treasury

A new software-only research project for shared treasury approvals on NEAR. The product name is being selected.

Development proceeds in tested feature checkpoints. Each release includes automated checks and a manual device checklist. Work on the next feature waits for feedback on the current checkpoint.

## Current status

Foundation: Git workflow and the first feature design are being prepared. No wallet, acoustic proximity verification, or payment execution has been implemented.

Proposed first checkpoint: [device readiness](docs/superpowers/specs/2026-11-12-device-readiness-design.md).

## Engineering rules

- Use real browser and blockchain APIs; label unimplemented behavior clearly.
- Camera/microphone checks require localhost or HTTPS and explicit user permission.
- No external hardware, NFC, tags, readers, or security keys.
- Document the assumptions and limitations of object-only access and acoustic participation.
- Never commit keys, captures, local certificates, or environment secrets.
