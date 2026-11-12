# Team Treasury

A new software-only research project for shared treasury approvals on NEAR. The product name is being selected.

Development proceeds in tested feature checkpoints. Each release includes automated checks and a manual device checklist. Work on the next feature waits for feedback on the current checkpoint.

## Current status

Feature 01 implements a real camera preview and in-memory frame capture, measured microphone input, and a speaker test requiring explicit audibility confirmation. Reset/stop releases device access. Physical-device acceptance is pending.

Approved first checkpoint: [device readiness](docs/superpowers/specs/2026-11-12-device-readiness-design.md). Follow the [manual acceptance checklist](docs/testing/feature-01-device-readiness.md). No wallet, object recognition, acoustic proximity verification, or payment execution is included yet.

## Local development

Requires Node.js 22.18+ (CI uses Node 24), npm, and Chrome for the local browser tests.

```sh
npm ci --prefix web
npm run dev --prefix web
```

Open `http://127.0.0.1:5173/` on the development laptop. Phones require the private HTTPS preview supplied with the release; plain HTTP LAN access cannot exercise capture permissions.

```sh
npm test --prefix web
npm run typecheck --prefix web
npm run test:browser --prefix web
npm run build --prefix web
```

The [GitHub Actions template](docs/testing/github-actions.example.yml) installs Playwright Chromium and uses it instead of the local Chrome channel. It is not active: the current GitHub token lacks permission to create workflow files. Local checks are available through `npm run check --prefix web`. Tests never enable fake capture devices or inject successful sensor responses. Physical capture and audibility remain manual checks.

Styling uses Tailwind CSS. Installed project design skills are pinned in `skills-lock.json`; their local instruction files are excluded from application source.

## Engineering rules

- Use real browser and blockchain APIs; label unimplemented behavior clearly.
- Camera/microphone checks require localhost or HTTPS and explicit user permission.
- No external hardware, NFC, tags, readers, or security keys.
- Document the assumptions and limitations of object-only access and acoustic participation.
- Never commit keys, captures, local certificates, or environment secrets.
