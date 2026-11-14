import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDemoUsers } from "../src/engines/app/demo-users.ts";
test("browser accepts only a bounded public testnet directory, rejecting unexpected secret fields", () => {
  assert.deepEqual(
    parseDemoUsers({ version: 1, accounts: ["bob.testnet", "alice.testnet"] }),
    ["alice.testnet", "bob.testnet"],
  );
  for (const data of [
    null,
    { version: 2, accounts: [] },
    { version: 1, accounts: ["alice.near"] },
    { version: 1, accounts: ["alice.testnet", "alice.testnet"] },
    { version: 1, accounts: [], secretKey: "unexpected" },
    {
      version: 1,
      accounts: [{ accountId: "alice.testnet", secretKey: "unexpected" }],
    },
    { version: 1, accounts: Array(101).fill("alice.testnet") },
  ])
    assert.throws(() => parseDemoUsers(data));
});
