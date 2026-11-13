import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateProposal,
  validateTreasury,
  validateEvidence,
} from "../src/integration/validation.ts";
const p = {
  network: "testnet",
  asset: "native",
  id: "42",
  contentHash: "hash",
  treasuryId: "team.testnet",
  recipient: "supplier.testnet",
  amountAtomic: "1",
  purpose: "Supplies",
  status: "pending",
  approvals: [],
  requiredApprovals: 1,
  expiresAt: "2026-11-20T00:00:00.000Z",
};
test("proposal boundary rejects wrong network, floating amounts and malformed authority fields", () => {
  assert.deepEqual(validateProposal(p), p);
  for (const bad of [
    { ...p, network: "mainnet" },
    { ...p, amountAtomic: "1.2" },
    { ...p, approvals: null },
    { ...p, requiredApprovals: 0 },
    { ...p, expiresAt: "bad" },
    { ...p, status: "success" },
  ])
    assert.throws(() => validateProposal(bad));
});
test("treasury and acoustic results cannot turn malformed adapter data into a successful state", () => {
  assert.throws(() =>
    validateTreasury({ network: "testnet", id: "team.testnet", members: null }),
  );
  assert.throws(() =>
    validateEvidence({
      proposalId: "42",
      contentHash: "hash",
      expiresAt: "bad",
      participantIds: [],
    }),
  );
});
