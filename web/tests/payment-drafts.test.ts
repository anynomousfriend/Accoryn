import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNearAmount,
  validateDraft,
  totalAtomic,
  encodeDrafts,
  decodeDrafts,
} from "../src/workspace/drafts.ts";
const draft = () => ({
  id: "be3eb854-035a-40fe-891f-19897e61abc2",
  reference: "INV-1",
  treasuryId: "team.testnet",
  recipient: "supplier.testnet",
  purpose: "Equipment",
  dueDate: "2026-11-20",
  lines: [
    {
      description: "Item",
      quantity: 2,
      unitAmount: "1.000000000000000000000001",
    },
  ],
  updatedAt: "2026-11-13T00:00:00.000Z",
});
test("native draft amounts remain exact beyond floating point precision", () => {
  assert.equal(
    parseNearAmount("1.000000000000000000000001"),
    "1000000000000000000000001",
  );
  assert.equal(totalAtomic(draft()), "2000000000000000000000002");
  for (const v of [
    "-1",
    "1e3",
    "1,000",
    ".",
    "0.0000000000000000000000001",
    "Infinity",
  ])
    assert.throws(() => parseNearAmount(v));
});
test("draft validation rejects malformed money, dates, accounts and incomplete invoice lines", () => {
  assert.deepEqual(validateDraft(draft()), draft());
  for (const v of [
    { ...draft(), recipient: "UPPER.testnet" },
    { ...draft(), reference: "" },
    { ...draft(), dueDate: "2026-02-30" },
    { ...draft(), lines: [] },
    {
      ...draft(),
      lines: [{ description: "Item", quantity: 0, unitAmount: "1" }],
    },
    {
      ...draft(),
      lines: [{ description: "Item", quantity: 1, unitAmount: "0" }],
    },
  ])
    assert.throws(() => validateDraft(v));
});
test("versioned draft persistence preserves only local preparation and rejects corrupt records", () => {
  assert.deepEqual(decodeDrafts(encodeDrafts([draft()])), [draft()]);
  assert.deepEqual(decodeDrafts(null), []);
  assert.throws(() => decodeDrafts("{bad"));
  assert.throws(() => decodeDrafts('{"version":999,"drafts":[]}'));
  assert.throws(() => validateDraft({ ...draft(), privateKey: "secret" }));
});

test("a completed proposal reference survives serialization and cannot silently change its invoice binding", async () => {
  const { encodeProposalRefs, decodeProposalRefs } = await import(
    "../src/workspace/storage.ts"
  );
  const ref = {
    draftId: "draft-1",
    treasuryId: "team.testnet",
    proposalId: "42",
    contentHash: "hash-1",
  };
  assert.deepEqual(decodeProposalRefs(encodeProposalRefs([ref])), [ref]);
  assert.throws(() => encodeProposalRefs([ref, { ...ref, proposalId: "43" }]));
  assert.throws(() => decodeProposalRefs('{"version":2}'));
});

test("an existing invoice proposal cannot be rebound to a different proposal", async () => {
  const { upsertProposalRef } = await import("../src/workspace/storage.ts");
  const ref = {
    draftId: "draft-1",
    treasuryId: "team.testnet",
    proposalId: "42",
    contentHash: "hash-1",
  };
  assert.deepEqual(upsertProposalRef([ref], ref), [ref]);
  assert.throws(() => upsertProposalRef([ref], { ...ref, proposalId: "43" }));
});
