# Changing approval tiers through a DAO proposal

The ceremony gate stores amount tiers per vault. Only the vault (the Sputnik DAO account itself) can change them: `set_tiers` checks that the caller is a DAO created by `sputnikv2.testnet`. So a tier change is a normal **FunctionCall governance proposal**. It needs the Admin threshold G = max(2, N−1) and leaves a public vote trail.

This works the same from Trezu's "custom function call" proposal on mainnet and from Sputnik's `add_proposal` on testnet. Trezu runs on mainnet only and this gate is deployed on testnet only.

**Test status:** the gate's unit tests cover `set_tiers` (DAO-only caller, validation, versioning). A tier change driven by a live DAO proposal has **not** been run yet; the commands below are the intended path, not recorded evidence.

## Rules the gate enforces

- 1–4 tiers, each `{ "up_to": "<yoctoNEAR>", "required": <2..16> }`. Limits must strictly increase and `required` must never decrease from one tier to the next.
- `window_secs` between 3,600 (1 hour) and 2,592,000 (30 days). Limits apply to the cumulative spend in this window, including the payment being approved.
- Spend above the highest limit always needs every member. Each tier is capped at the team size.
- Each change increments the tier `version`. `get_tiers({"dao_id": …})` shows the active set; the public board shows it as plain lines.

## Example: up to 0.5 NEAR needs 2, up to 5 NEAR needs 3, above that everyone, in a 24-hour window

Arguments to `set_tiers`:

```json
{"tiers":[{"up_to":"500000000000000000000000","required":2},{"up_to":"5000000000000000000000000","required":3}],"window_secs":86400}
```

Base64 of those exact bytes:

```text
eyJ0aWVycyI6W3sidXBfdG8iOiI1MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJyZXF1aXJlZCI6Mn0seyJ1cF90byI6IjUwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJyZXF1aXJlZCI6M31dLCJ3aW5kb3dfc2VjcyI6ODY0MDB9
```

### Sputnik (testnet): one member proposes

```sh
near contract call-function as-transaction YOUR_VAULT.sputnikv2.testnet add_proposal json-args '{
  "proposal": {
    "description": "Change approval tiers: 0.5 NEAR / 5 NEAR, 24h window",
    "kind": { "FunctionCall": {
      "receiver_id": "ceremony-gate-v1.accoryn.testnet",
      "actions": [{
        "method_name": "set_tiers",
        "args": "eyJ0aWVycyI6W3sidXBfdG8iOiI1MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJyZXF1aXJlZCI6Mn0seyJ1cF90byI6IjUwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJyZXF1aXJlZCI6M31dLCJ3aW5kb3dfc2VjcyI6ODY0MDB9",
        "deposit": "0",
        "gas": "30000000000000"
      }]
    }}
  }
}' prepaid-gas '50 Tgas' attached-deposit '0 NEAR' sign-as YOU.testnet network-config testnet sign-with-legacy-keychain send
```

Then G members each call `act_proposal` with `{"id": <proposal id>, "action": "VoteApprove", "proposal": <the same kind object>}`. When the threshold is reached, Sputnik calls the gate as the vault, and `get_tiers` shows the new version.

### Trezu (mainnet): custom function call

Create a custom function-call request with:

| Field | Value |
|---|---|
| Contract | the gate account |
| Method | `set_tiers` |
| Arguments | the JSON above |
| Deposit | 0 |
| Gas | 30 Tgas |

Admins then approve it under the treasury's governance threshold. With our role layout, Trezu's Approver role is the gate, which approves transfers only, so a tier change always goes through Admin governance, never through the meeting gate.

## What this does not do

A tier change cannot approve a payment on its own, and members cannot lower tiers alone: it takes G approvals. The same governance power can also replace the gate or the policy. That escape hatch is disclosed in the [threat model](../security/ceremony-threat-model.md).
