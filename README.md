# Team Treasury

A new software-only research project for shared treasury approvals on NEAR. The product name is being selected.

Development proceeds in tested feature checkpoints. Each release includes automated checks and a manual device checklist. Work on the next feature waits for feedback on the current checkpoint.

## Current status

Development is now **features first**. Visual redesign is paused. The app opens directly on the first functional checkpoint; each subsequent feature waits for the user's manual acceptance of the previous one.

See [functional checkpoint status](docs/FEATURE_STATUS.md) for what is implemented, what automation verified, and the current manual test gate.

Feature 01 implements a real camera preview and in-memory frame capture, measured microphone input, and a speaker test requiring explicit audibility confirmation. Reset/stop releases device access. Physical-device acceptance is pending.

Previous visual work is retained at `/landing/` and `/design/` for later. The [editable reference](docs/design/experience-system.md) documents those components; it is not the current development priority.

| Route | What it does |
| --- | --- |
| `/` | Opens Feature 1: real device-readiness checks |
| `/device-check/` | Runs real device checks |
| `/landing/` | Previous visual preview, retained for later |
| `/design/` | Labelled component/status/motion specimens; no transaction |
| `/design/?content=long` | Reference with long labels/identifiers |

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

The native tab-visibility test opens an isolated temporary Chrome profile. Linux runners need `xvfb-run -a npm run test:browser --prefix web`. Production builds emit actual HTML entries for deep routes. Fonts and artwork are local to the build.

The [track-evidence roadmap](docs/hackathon/track-alignment.md) targets Social Money, Open Innovation alongside it and Real-World Money after a complete business payout. The UI alone is not a completed NEAR integration. [DINOv2-small and ggwave are recommended baselines](docs/research/vision-audio-baselines.md); neither is integrated in this release.

## Engineering rules

- Use real browser and blockchain APIs; label unimplemented behavior clearly.
- Camera/microphone checks require localhost or HTTPS and explicit user permission.
- No external hardware, NFC, tags, readers, or security keys.
- Document the assumptions and limitations of object-only access and acoustic participation.
- Never commit keys, captures, local certificates, or environment secrets.
