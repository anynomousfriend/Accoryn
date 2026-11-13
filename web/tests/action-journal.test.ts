import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodePendingAction,
  encodePendingAction,
} from "../src/workspace/action-journal.ts";
test("uncertain financial action retains its identity across reload instead of becoming a new submission", () => {
  const pending = {
    requestId: "request-1",
    kind: "proposePayment",
    treasuryId: "team.testnet",
    draftId: "draft-1",
    proposalId: null,
    startedAt: "2026-11-13T00:00:00.000Z",
  };
  assert.deepEqual(decodePendingAction(encodePendingAction(pending)), pending);
  assert.equal(decodePendingAction(null), null);
  assert.throws(() => decodePendingAction('{"version":999}'));
  assert.throws(() => encodePendingAction({ ...pending, requestId: "" }));
});

test("unknown results and pending execution retain the reconciliation barrier", async () => {
  const { actionConfirmed } = await import(
    "../src/workspace/action-journal.ts"
  );
  assert.equal(actionConfirmed("executeProposal", "pending"), false);
  assert.equal(actionConfirmed("proposePayment", "unknown"), false);
  assert.equal(actionConfirmed("approveProposal", "unknown"), false);
  assert.equal(actionConfirmed("proposePayment", "pending"), true);
  assert.equal(actionConfirmed("executeProposal", "settled"), true);
});
