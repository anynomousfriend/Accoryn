# NEAR agent tools and the account faucet cooldown

## What was integrated

Official sources:
- [near/agent-skills](https://github.com/near/agent-skills), pinned at `cb32b6af195e636c1e9c2efe2ea75a6d85b6b67b`: near-api-js, near-dapp, near-smart-contracts installed locally in `.agents/skills/`. These are agent instructions, not browser dependencies. They become discoverable on the next agent turn. Local skill copies remain ignored; `tools/near/sources.json` records provenance.
- [nearai/near-mcp](https://github.com/nearai/near-mcp), package `@nearai/near-mcp@0.0.35`, isolated under `tools/near/` with its own lockfile. Its source was inspected at `7d598bd9a9e46dac4bf6851f788f8e4e7a4e88a0`; the registry package is independently pinned by integrity, not asserted to be built from that commit.

The official server includes mainnet and signing/key-management tools. This project wraps it with a small stdio adapter exposing only:
1. `account_view_account_summary`
2. `contract_view_functions`
3. `contract_call_raw_function_as_read_only`

The adapter forces omitted network arguments to `testnet`, rejects mainnet and all other tool names, and supplies an isolated `.local/near-mcp-keystore/` directory. Never import signing keys into it or point it at a browser/CLI keystore. No external HTTP listener is created. This is development tooling, not runtime wallet infrastructure or a faucet workaround.

## Setup and verify

From the repository root:

```sh
npm ci --prefix tools/near --ignore-scripts
npm test --prefix tools/near
npm run verify --prefix tools/near
```

The project-local `.codex/config.toml` registers `near_testnet`. Start a new trusted Codex session in this repository to load newly configured MCP tools. Recognition can be checked with `codex mcp get near_testnet --json`. The current conversation does not automatically gain newly registered tools; the verification script uses a real MCP client to validate the connection now.

The smoke verifier checks a genuine MCP handshake/tool listing, rejects mainnet/writes and calls the deployed gate's `get_config` view on testnet. It sends no signed transaction and creates no account. Expected configuration includes `factory_suffix: sputnikv2.testnet`, TTL bounds 60–600 and deposit `100000000000000000000000` yoctoNEAR.

To reproduce local skill installation with a skills-compatible client, use the official install command against the pinned source and select the three names above:

```sh
npx skills add https://github.com/near/agent-skills/tree/cb32b6af195e636c1e9c2efe2ea75a6d85b6b67b
```

The session installation used Codex's supplied skill-installer with exact skill paths and revision, rather than replacing existing skills. No near-kit migration, intents integration or AI Cloud dependency was added.

### Upstream dependency limit

The isolated MCP dependency audit reported 50 findings: 13 low, 35 moderate and 2 high (the upstream package and its Zod dependency). The high advisory concerns oversized constrained collections causing memory exhaustion in affected Zod versions; npm reports no supported automatic fix for this upstream version. This is not a clean security audit. The adapter is local stdio/read-only with an isolated empty keystore; it is not suitable for exposing as a public service or granting custody. No blind `npm audit fix` or incompatible SDK override was applied. Recheck with `npm audit --prefix tools/near` before expanding its scope. Frontend dependencies and lockfile are unchanged.

## Why account creation returns HTTP 429

The browser account path uses `POST https://helper.nearprotocol.com/account`, the same public helper used by the testnet tooling. On 2026-11-14 IST, one diagnostic request with an invalid empty body (cannot create an account) returned:

```text
HTTP 429
x-ratelimit-limit: 10
x-ratelimit-remaining: 0
retry-after: 28287
Rate limit exceeded, retry in 8 hours.
```

The response Date plus Retry-After, corroborated by x-ratelimit-reset, estimated a retry around **2026-11-14 09:08 IST**. This is an observed estimate, not a service guarantee.

That is evidence of an exhausted helper quota for that request's network context. It does not prove whether the provider groups limits by IP, account, route or another dimension; do not invent that scope. It is separate from JSON-RPC throttling, object matching and NEAR transaction signature verification.

Installing MCP/skills or switching RPC providers cannot replenish this faucet allowance. Do not hammer the helper, rotate addresses/endpoints to evade its limit, or create repeated replacement account intents. The already-created account/read/payment paths do not use this helper merely to load an account or sign a payment, though RPC providers have their own independent limits.

## Application behavior

- HTTP 429 now names the **free testnet account faucet**, explains rate limiting, and displays an approximate wait when the service supplies a valid hint.
- Parse standard Retry-After seconds/HTTP-date first. If browsers cannot read that header, recognize only the helper's bounded known cooldown sentence; arbitrary upstream text is never echoed into the UI.
- The parser ignores malformed/excessive hints. Unknown cooldowns stay unknown; the app does not invent a reset time.
- A refusal still triggers an ownership re-check. If the account actually exists with the original FullAccess key, the chain outcome overrides the HTTP refusal.
- No success is fabricated and no automatic retry loop was introduced. The original request and generated key remain preserved. Cooldown metadata is informational, not a persistent client-side scheduler or security boundary.

## Manual recovery

1. Keep this browser's site data. Do not replace/delete the original pending account key.
2. Read the status. A faucet refusal is not a failed object scan.
3. Use **Reconcile original request** to check whether the account already exists with your key.
4. If creation is still unresolved/absent, wait for the stated provider cooldown and use **Resume original request**. Resume retains the original account/key; it is not a new-name operation.
5. If you already have a funded account whose key lives in this same browser, select it under **Local account → Use local account** for the demo. A username on another browser is not sufficient.
6. If no suitable accounts exist, the end-to-end demo remains blocked until the faucet permits creation or an explicit funded-sponsor path is integrated. A separate `createSubAccount` engine exists, but it is not automatically substituted in this UI and requires an authorized funded parent.

A cooldown expiry is permission to retry, not a promise of service availability. No new account creation or payout was performed for this diagnosis.

## Verification checkpoint

198 web unit tests and 66 browser tests passed, with two live unit tests and one live browser spending test skipped. Type checking, build and production smoke passed. Two tooling policy tests and the actual MCP gate view passed. No live account creation or signed payment was performed.
