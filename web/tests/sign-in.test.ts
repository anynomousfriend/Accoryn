// Object sign-in policy: which signing session may authorize which account.
// Pure logic only; camera capture and object discrimination need manual tests.
import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_MS,
  setupSession,
  objectSession,
  sessionAllows,
} from "../src/engines/app/sign-in.ts";
import { accountTemplateKey } from "../src/engines/app/member-object.ts";
import { NearRpcClient } from "../src/engines/near/rpc.ts";
import {
  Keystore,
  createMemoryKeyRecordStore,
} from "../src/engines/near/keystore.ts";
import {
  TxJournal,
  createMemoryTxRecordStore,
} from "../src/engines/near/txjournal.ts";
import {
  Operations,
  memoryOperationStore,
} from "../src/engines/app/operations.ts";
import { TreasuryEngine } from "../src/engines/app/engine.ts";

const NOW = 1_800_000_000_000;

test("a setup session can only create a new account, never sign as an existing one", () => {
  const s = setupSession(NOW);
  assert.equal(s.until, NOW + SESSION_MS);
  assert.equal(sessionAllows(s, null, NOW), true);
  assert.equal(sessionAllows(s, "alice.testnet", NOW), false);
  assert.equal(sessionAllows(s, null, NOW + SESSION_MS), false);
});

test("an object session signs only as the account whose object matched", () => {
  const s = objectSession("alice.testnet", "tpl-1", 0.8, NOW - 1000, NOW);
  assert.equal(s.kind, "object");
  assert.equal(sessionAllows(s, "alice.testnet", NOW), true);
  assert.equal(sessionAllows(s, null, NOW), true);
  assert.equal(sessionAllows(s, "bob.testnet", NOW), false);
  assert.equal(sessionAllows(s, "alice.testnet", NOW + SESSION_MS), false);
  assert.equal(sessionAllows(null, "alice.testnet", NOW), false);
});

test("an object session requires a fresh demo match", () => {
  assert.throws(() =>
    objectSession("alice.testnet", "tpl-1", 0.5, NOW - 1000, NOW),
  );
  assert.throws(() =>
    objectSession("alice.testnet", "tpl-1", Number.NaN, NOW - 1000, NOW),
  );
  assert.throws(() =>
    objectSession("alice.testnet", "tpl-1", 0.9, NOW - 120_000, NOW),
  );
  assert.throws(() =>
    objectSession("alice.testnet", "tpl-1", 0.9, NOW + 1, NOW),
  );
  assert.throws(() => objectSession("", "tpl-1", 0.9, NOW - 1, NOW));
  assert.throws(() => objectSession("alice.testnet", "", 0.9, NOW - 1, NOW));
});

test("each account has one sign-in object key, validated like member keys", () => {
  assert.equal(
    accountTemplateKey("alice.testnet"),
    'account-v1:["alice.testnet"]',
  );
  assert.notEqual(
    accountTemplateKey("alice.testnet"),
    accountTemplateKey("bob.testnet"),
  );
  assert.throws(() => accountTemplateKey("Alice.testnet"));
  assert.throws(() => accountTemplateKey("alice.near"));
});

function engineWith(authorize: (accountId: string | null) => Promise<boolean>) {
  const rpc = new NearRpcClient({
    fetch: async () => {
      throw new Error("no network in this test");
    },
  });
  return new TreasuryEngine({
    rpc,
    keys: new Keystore(createMemoryKeyRecordStore()),
    journal: new TxJournal(createMemoryTxRecordStore(), { locks: null }),
    operations: new Operations(memoryOperationStore()),
    authorize,
  });
}

test("selecting an account asks authorization for that exact account", async () => {
  const asked: (string | null)[] = [];
  const engine = engineWith(async (id) => {
    asked.push(id);
    return false;
  });
  await assert.rejects(
    () => engine.selectAccount("bob.testnet", new AbortController().signal),
    /sign/i,
  );
  assert.deepEqual(asked, ["bob.testnet"]);
});

test("the signer is refused when the session does not cover the current account", async () => {
  const asked: (string | null)[] = [];
  const engine = engineWith(async (id) => {
    asked.push(id);
    return id === "alice.testnet";
  });
  engine.accountId = "bob.testnet";
  await assert.rejects(
    () => engine.signer(new AbortController().signal),
    /sign/i,
  );
  assert.deepEqual(asked, ["bob.testnet"]);
});
