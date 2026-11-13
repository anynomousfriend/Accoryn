import { test } from "node:test";
import assert from "node:assert/strict";
import { getAppServices } from "../src/integration/bindings.ts";
import { hasService, requireService } from "../src/integration/services.ts";
test("missing engines cannot advertise or return successful financial operations", () => {
  const services = getAppServices();
  assert.equal(services.version, 1);
  for (const method of [
    "openAccount",
    "recoverAccount",
    "readTreasury",
    "createTreasury",
    "joinTreasury",
    "proposePayment",
    "startAcousticSession",
    "approveProposal",
    "executeProposal",
    "readProposal",
    "listReceipts",
    "reconcileAction",
  ] as const) {
    assert.equal(hasService(services, method), false);
    assert.throws(() => requireService(services, method), /not connected/i);
  }
});
