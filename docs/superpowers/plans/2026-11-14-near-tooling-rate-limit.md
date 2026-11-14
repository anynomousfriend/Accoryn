# Official NEAR tooling and testnet rate-limit diagnosis

Scope: user requests official NEAR MCP/skills integration and investigation of account-creation HTTP 429. No custody changes, faucet-limit circumvention, key imports, new signed transactions, contract deployment or automatic main merge.

Evidence: one invalid-body POST to the existing helper returned HTTP 429, x-ratelimit-limit=10, remaining=0, Retry-After=28287 and `Rate limit exceeded, retry in 8 hours.` This proves this network request was rate-limited; exact quota scope is not proven. Account ownership must still be checked on-chain after every attempt.

## Acceptance

- [x] Inspect official near/agent-skills and nearai/near-mcp; pin provenance and install project-relevant near-api-js, near-dapp, near-smart-contracts locally.
- [x] Isolated tools/near dependency lockfile; official MCP behind a small read-only, testnet-only adapter. Project Codex config and setup documentation; no app/runtime dependency or user key import.
- [x] Failing tests for tool allowlist/network enforcement, then real MCP handshake and read-only gate view.
- [x] Failing regression tests for helper 429 cooldown headers/body, malformed metadata and chain ownership overriding HTTP refusal; then actionable account UI error preserving original intent/key.
- [x] Relevant full web suite and tooling checks; document actual faucet evidence, dependency limits and how to retry the original request. Cohesive local commits on feat/near-tooling-testnet-rate-limit; manual test handoff.

No retry loops or endpoint rotation to bypass provider limits. MCP is development tooling, not wallet infrastructure. The faucet remains external; improved diagnostics must not be reported as successful account creation.

## Verification checkpoint

198 web unit tests passed (2 live skipped), 66 browser tests passed (1 live skipped), typecheck/build/production smoke passed. Two tooling policy tests and real official MCP handshake + deployed get_config passed; Codex recognizes project configuration. The official MCP audit has upstream findings, explicitly documented and not labelled resolved. The diagnostic helper response estimated quota reset at approximately 2026-11-14 09:08 IST; service availability is not guaranteed. Manual account creation remains pending provider quota and user acceptance.
