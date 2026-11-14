import { test } from "node:test";
import assert from "node:assert/strict";
import {
  memberTemplateKey,
  acknowledgeComparison,
  validObjectCheck,
  type ObjectCheckContext,
} from "../src/engines/app/member-object.ts";

const context: ObjectCheckContext = {
  accountId: "alice.testnet",
  vaultId: "team.sputnikv2.testnet",
  contentHash: "exact-payment",
  proposalId: "0",
  sessionId: "session-one",
  templateId: "template-one",
  modelRevision: "pinned-model",
  sessionExpiresAt: 10_000,
};
test("member templates are scoped to both vault and member, never the legacy active record", () => {
  const a = memberTemplateKey(context.vaultId, context.accountId);
  assert.notEqual(a, "active");
  assert.notEqual(a, memberTemplateKey(context.vaultId, "bob.testnet"));
  assert.notEqual(
    a,
    memberTemplateKey("other.sputnikv2.testnet", context.accountId),
  );
  assert.throws(() => memberTemplateKey("", context.accountId));
  assert.throws(() => memberTemplateKey(context.vaultId, "../alice"));
});
test("research acknowledgement expires and never substitutes for another member, template or payment", () => {
  const check = acknowledgeComparison(context, 1_000);
  assert.equal(check.expiresAt, 10_000);
  assert.equal(validObjectCheck(check, context, 1_001), true);
  assert.equal(validObjectCheck(null, context, 1_001), false);
  assert.equal(validObjectCheck(check, context, 10_000), false);
  assert.equal(validObjectCheck(check, context, 999), false);
  for (const key of [
    "accountId",
    "vaultId",
    "contentHash",
    "proposalId",
    "sessionId",
    "templateId",
    "modelRevision",
  ] as const) {
    assert.equal(
      validObjectCheck(check, { ...context, [key]: "changed" }, 1_001),
      false,
      key,
    );
  }
  assert.equal(
    validObjectCheck(check, { ...context, sessionExpiresAt: 1_001 }, 1_001),
    false,
  );
});
test("no acknowledgement outlives two minutes or permits absent context", () => {
  const long = { ...context, sessionExpiresAt: 1_000_000 };
  const check = acknowledgeComparison(long, 1_000);
  assert.equal(check.expiresAt, 121_000);
  assert.equal(validObjectCheck(check, long, 121_000), false);
  assert.throws(() =>
    acknowledgeComparison({ ...context, sessionId: "" }, 1_000),
  );
  assert.throws(() => acknowledgeComparison(context, 10_000));
  assert.equal(validObjectCheck(check, long, NaN), false);
});
