# Demo user picker

## Request and scope

On `feat/near-tooling-testnet-rate-limit` only, let demo participants select app-created users instead of typing their account IDs when adding vault members or choosing a payment recipient. Keep existing custody, contract authority and object research behavior.

## Approaches

- Browser-only list: reuses local key metadata, but cannot discover accounts created on the other device. This does not meet the two-device demo need.
- Shared local demo directory (recommended): the laptop dev server stores public testnet account IDs and exposes them to both devices. No external service or new authentication provider.
- Global NEAR account discovery: unnecessary for the demo; this list should represent this application's participants, not every account on NEAR.

## Approved design

After confirmed account creation or successful selection of an existing local account, publish only its public account ID to the local demo directory. Validate account IDs and check on-chain existence before directory admission. Never transmit keys, object templates or camera images. Deduplicate entries, bound directory/request size and keep any local persistence ignored by Git.

Use a multi-select list for vault members, with the current creator already included; use a single-select list for payment recipients. Reuse the member picker for governance membership editing, preserving the complete proposed roster. Display full account IDs to distinguish similar names. Include explicit loading, empty, unavailable and refresh states. Keep manual entry under an optional secondary control for accounts not in the demo directory.

Directory presence is discovery, not identity authentication or vault membership. Other devices' accounts must not appear as usable local signing accounts: selecting a member/recipient does not grant access to that person's wallet. Preserve on-chain ownership/membership checks and exact payment review.

Existing accounts appear after their owner selects them once in their browser. The server cannot inspect another browser's private storage. Directory synchronization is demo/dev-server functionality; a static production build must explain unavailability and retain manual entry rather than pretending to share users.

## Acceptance checklist

- [x] A confirmed account on device B can be selected as a member on device A without typing its ID.
- [x] A known demo user can be selected as recipient without typing its ID.
- [x] Creator inclusion, complete governance roster and explicit recipient review remain intact.
- [x] Duplicate, malformed and unconfirmed accounts do not produce misleading directory entries.
- [x] No signing secrets, object templates or photos leave the browser.
- [x] Missing directory/network failure is actionable; current selections are retained.
- [x] Selecting a remote account never makes it a usable local signer.
- [x] Automated tests cover real shared HTTP storage and UI selection; manual two-device steps accompany the release.
