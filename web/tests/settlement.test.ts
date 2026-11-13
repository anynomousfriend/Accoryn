import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifySettlement } from "../src/engines/near/settlement.ts";

// Real testnet recordings from scripts/smoke-ceremony-testnet.ts (not mocks).
const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ceremony/${name}`, import.meta.url), "utf8")).result;
const txStatus = load("tx_status.execute.json");
const proposal = load("get_proposal.executed.json");
const expected = {
  daoId: "accoryn-spike.sputnikv2.testnet",
  receiverId: "accoryn-payee.testnet",
  amountAtomic: "50000000000000000000000",
  proposalStatus: proposal.status,
};
const clone = () => structuredClone(txStatus);

test("a recorded testnet payout verifies as settled", () => {
  const result = verifySettlement(txStatus, expected);
  assert.deepEqual(result, {
    ok: true,
    txHash: "4NKh8ik6P9a66RfDyUsaVNpbYSPVnBPmjNJwon2swzw5",
    receiptId: "HoMGSFPbKpfuMaEcTrJi5ZW3dt6DrZX54hVXfd7mPZTD",
  });
});

test("settlement requires the proposal to be Approved", () => {
  assert.deepEqual(verifySettlement(txStatus, { ...expected, proposalStatus: "InProgress" }), {
    ok: false,
    reason: "PROPOSAL_NOT_APPROVED",
  });
});

test("a different amount or recipient is not this payment", () => {
  assert.equal(verifySettlement(txStatus, { ...expected, amountAtomic: "50000000000000000000001" }).ok, false);
  assert.deepEqual(verifySettlement(txStatus, { ...expected, receiverId: "accoryn-bob.testnet" }), {
    ok: false,
    reason: "NO_TRANSFER",
  });
  assert.deepEqual(verifySettlement(txStatus, { ...expected, daoId: "other.sputnikv2.testnet" }), {
    ok: false,
    reason: "NO_TRANSFER",
  });
});

test("a non-final or failed transfer receipt is not settlement", () => {
  const pending = clone();
  pending.final_execution_status = "EXECUTED_OPTIMISTIC";
  assert.deepEqual(verifySettlement(pending, expected), { ok: false, reason: "NOT_FINAL" });

  const failed = clone();
  const outcome = failed.receipts_outcome.find(
    (o: { id: string }) => o.id === "HoMGSFPbKpfuMaEcTrJi5ZW3dt6DrZX54hVXfd7mPZTD",
  );
  outcome.outcome.status = { Failure: { ActionError: { index: 0, kind: { AccountDoesNotExist: {} } } } };
  assert.deepEqual(verifySettlement(failed, expected), { ok: false, reason: "TRANSFER_FAILED" });

  const missingOutcome = clone();
  missingOutcome.receipts_outcome = missingOutcome.receipts_outcome.filter(
    (o: { id: string }) => o.id !== "HoMGSFPbKpfuMaEcTrJi5ZW3dt6DrZX54hVXfd7mPZTD",
  );
  assert.deepEqual(verifySettlement(missingOutcome, expected), { ok: false, reason: "TRANSFER_FAILED" });
});

test("two matching transfers are ambiguous and refused", () => {
  const doubled = clone();
  const transfer = doubled.receipts.find((r: { receiver_id: string }) => r.receiver_id === expected.receiverId);
  doubled.receipts.push({ ...structuredClone(transfer), receipt_id: "Dup1111111111111111111111111111111111111111" });
  doubled.receipts_outcome.push({
    ...structuredClone(doubled.receipts_outcome[0]),
    id: "Dup1111111111111111111111111111111111111111",
    outcome: { ...structuredClone(doubled.receipts_outcome[0].outcome), status: { SuccessValue: "" } },
  });
  assert.deepEqual(verifySettlement(doubled, expected), { ok: false, reason: "MULTIPLE_TRANSFERS" });
});

test("malformed responses fail closed", () => {
  for (const value of [null, {}, { final_execution_status: "FINAL" }, { ...txStatus, receipts: "x" }]) {
    assert.deepEqual(verifySettlement(value, expected), { ok: false, reason: "MALFORMED" });
  }
});
