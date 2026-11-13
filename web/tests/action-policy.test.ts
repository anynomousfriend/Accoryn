import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeActionIntent,
  validateReconciliation,
} from "../src/workspace/action-policy.ts";
const proposal = {
  network: "testnet" as const,
  asset: "native" as const,
  id: "B",
  contentHash: "hash-B",
  treasuryId: "other.testnet",
  recipient: "supplier.testnet",
  amountAtomic: "1000000000000000000000000",
  purpose: "Canonical B purpose",
  status: "pending" as const,
  approvals: ["alice.testnet"],
  requiredApprovals: 1,
  expiresAt: "2026-11-20T00:00:00.000Z",
};
const draft = {
  id: "be3eb854-035a-40fe-891f-19897e61abc2",
  reference: "INV-A",
  treasuryId: "team.testnet",
  recipient: "supplier.testnet",
  purpose: "Draft A purpose",
  dueDate: "2026-11-20",
  lines: [{ description: "Item", quantity: 1, unitAmount: "1" }],
  updatedAt: "2026-11-13T00:00:00.000Z",
};
test("existing proposal actions cannot inherit an unrelated reviewed draft", () => {
  const intent = makeActionIntent(
    {
      kind: "approveProposal",
      proposal,
      actor: "alice.testnet",
      refs: [
        {
          draftId: draft.id,
          treasuryId: "team.testnet",
          proposalId: "A",
          contentHash: "hash-A",
        },
      ],
    },
    "request-B",
    "2026-11-13T00:00:00.000Z",
  );
  assert.equal(intent.draftId, null);
  assert.equal(intent.proposalId, "B");
  assert.equal(intent.treasuryId, "other.testnet");
  assert.equal(intent.expected?.purpose, "Canonical B purpose");
});
test("confirmed proposal recovery requires the original intent and matching canonical proposal", () => {
  const intent = makeActionIntent(
    { kind: "proposePayment", draft },
    "request-A",
    "2026-11-13T00:00:00.000Z",
  );
  assert.throws(() =>
    validateReconciliation(intent, {
      requestId: "request-A",
      status: "confirmed",
    }),
  );
  assert.throws(() =>
    validateReconciliation(intent, {
      requestId: "request-A",
      status: "confirmed",
      outcome: { kind: "proposePayment", proposal },
    }),
  );
  const matched = {
    ...proposal,
    id: "A",
    contentHash: "hash-A",
    treasuryId: draft.treasuryId,
    purpose: draft.purpose,
  };
  const result = validateReconciliation(intent, {
    requestId: "request-A",
    status: "confirmed",
    outcome: { kind: "proposePayment", proposal: matched },
  });
  assert.equal(result.clear, true);
  assert.equal(result.proposal?.id, "A");
  assert.equal(result.reference?.draftId, draft.id);
});
test("pending execution and wrong action identities cannot erase the journal", () => {
  const intent = makeActionIntent(
    { kind: "executeProposal", proposal, actor: "alice.testnet", refs: [] },
    "request-B",
    "2026-11-13T00:00:00.000Z",
  );
  assert.equal(
    validateReconciliation(intent, {
      requestId: "request-B",
      status: "confirmed",
      outcome: { kind: "executeProposal", proposal },
    }).clear,
    false,
  );
  assert.throws(() =>
    validateReconciliation(intent, { requestId: "wrong", status: "rejected" }),
  );
  assert.throws(() =>
    validateReconciliation(intent, {
      requestId: "request-B",
      status: "confirmed",
      outcome: { kind: "approveProposal", proposal },
    }),
  );
});
