import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyProposalSettlement } from "../src/engines/app/settlement-binding.ts";
const recorded = JSON.parse(
  readFileSync(
    new URL("./fixtures/ceremony/tx_status.execute.json", import.meta.url),
    "utf8",
  ),
).result;
const expected = {
  gateId: "ceremony-gate-v1.accoryn.testnet",
  daoId: "accoryn-spike.sputnikv2.testnet",
  proposalId: "1",
  sessionId: "1",
  receiverId: "accoryn-payee.testnet",
  amountAtomic: "50000000000000000000000",
  proposalStatus: "Approved",
};
test("recorded exact gate execution and descendant payout are bound to proposal 1", () => {
  assert.equal(verifyProposalSettlement(recorded, expected).ok, true);
});
test("a payout for another proposal or ceremony cannot be attributed to this invoice", () => {
  assert.equal(
    verifyProposalSettlement(recorded, { ...expected, proposalId: "2" }).ok,
    false,
  );
  assert.equal(
    verifyProposalSettlement(recorded, { ...expected, sessionId: "2" }).ok,
    false,
  );
});
test("a matching successful transfer outside the matching DAO vote ancestry is refused", () => {
  const tx = structuredClone(recorded);
  const vote = tx.receipts.find(
    (r: any) =>
      r.predecessor_id === expected.gateId && r.receiver_id === expected.daoId,
  );
  const outcome = tx.receipts_outcome.find(
    (o: any) => o.id === vote.receipt_id,
  );
  const transfer = tx.receipts.find(
    (r: any) => r.receiver_id === expected.receiverId,
  );
  outcome.outcome.receipt_ids = outcome.outcome.receipt_ids.filter(
    (id: string) => id !== transfer.receipt_id,
  );
  assert.equal(verifyProposalSettlement(tx, expected).ok, false);
});
test("changing the DAO vote proposal ID breaks the evidence binding", () => {
  const tx = structuredClone(recorded);
  const vote = tx.receipts.find(
    (r: any) =>
      r.predecessor_id === expected.gateId && r.receiver_id === expected.daoId,
  );
  const call = vote.receipt.Action.actions[0].FunctionCall;
  const args = JSON.parse(Buffer.from(call.args, "base64").toString());
  args.id = 2;
  call.args = Buffer.from(JSON.stringify(args)).toString("base64");
  assert.equal(verifyProposalSettlement(tx, expected).ok, false);
});
