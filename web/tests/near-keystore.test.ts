// Keystore record rules with the in-memory record store. The IndexedDB adapter
// is exercised in a real browser by near-keystore.spec.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyPairEd25519, KeyPairSigner, baseDecode } from "near-api-js";
import {
  Keystore,
  KeystoreConflictError,
  KeystoreRecordError,
  createMemoryKeyRecordStore,
  validateKeyRecord,
} from "../src/engines/near/keystore.ts";
import type { AccessKeyView } from "../src/engines/near/rpc.ts";

const ID = "accoryn-unit-dana.testnet";

function record(overrides: Record<string, unknown> = {}) {
  const pair = KeyPairEd25519.fromRandom();
  return {
    version: 1,
    network: "testnet",
    accountId: ID,
    publicKey: pair.getPublicKey().toString(),
    secretKey: pair.toString(),
    createdAt: "2026-11-13T12:00:00.000Z",
    status: "pending",
    ...overrides,
  };
}

test("prepare creates one pending key per account and reuses it on retry", async () => {
  const store = createMemoryKeyRecordStore();
  const keystore = new Keystore(store);
  const first = await keystore.prepare(ID);
  assert.deepEqual(Object.keys(first).sort(), ["accountId", "createdAt", "network", "publicKey", "status"]);
  assert.equal(first.status, "pending");
  assert.equal(first.network, "testnet");
  assert.match(first.publicKey, /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/);
  const again = await keystore.prepare(ID);
  assert.deepEqual(again, first);
  await assert.rejects(keystore.generate(ID), KeystoreConflictError);
  const raw = (await store.get(ID)) as { secretKey: string; publicKey: string };
  assert.equal(raw.publicKey, first.publicKey);
  assert.equal(baseDecode(raw.secretKey.slice("ed25519:".length)).length, 64);
});

test("list and get never expose secret material", async () => {
  const store = createMemoryKeyRecordStore();
  const keystore = new Keystore(store);
  await keystore.prepare(ID);
  await keystore.prepare("accoryn-unit-erin.testnet");
  const secrets = (await store.entries()).map(([, value]) => (value as { secretKey: string }).secretKey);
  const listed = await keystore.list();
  assert.equal(listed.length, 2);
  const text = JSON.stringify([listed, await keystore.get(ID)]);
  assert.doesNotMatch(text, /secretKey/);
  for (const secret of secrets) {
    assert.ok(!text.includes(secret));
    assert.ok(!text.includes(secret.slice("ed25519:".length)));
  }
  assert.deepEqual(
    listed.map((entry) => entry.usable && entry.account.accountId).sort(),
    ["accoryn-unit-dana.testnet", "accoryn-unit-erin.testnet"],
  );
});

test("signerFor returns a near-api-js signer for the stored key", async () => {
  const keystore = new Keystore(createMemoryKeyRecordStore());
  const account = await keystore.prepare(ID);
  const signer = await keystore.signerFor(ID);
  assert.ok(signer instanceof KeyPairSigner);
  assert.equal((await signer.getPublicKey()).toString(), account.publicKey);
  await assert.rejects(keystore.signerFor("accoryn-unit-nobody.testnet"), /no key/i);
});

test("corrupted records are reported as unusable and never silently repaired", async () => {
  const store = createMemoryKeyRecordStore();
  const keystore = new Keystore(store);
  const good = record({ accountId: "accoryn-unit-good.testnet" });
  await store.put("accoryn-unit-good.testnet", good as never);
  const other = KeyPairEd25519.fromRandom();
  const corrupt: Array<[string, unknown]> = [
    ["accoryn-unit-v2.testnet", record({ accountId: "accoryn-unit-v2.testnet", version: 2 })],
    ["accoryn-unit-main.testnet", record({ accountId: "accoryn-unit-main.testnet", network: "mainnet" })],
    ["accoryn-unit-mismatch.testnet", record({ accountId: "accoryn-unit-mismatch.testnet", publicKey: other.getPublicKey().toString() })],
    ["accoryn-unit-key.testnet", record({ accountId: "accoryn-unit-other-key.testnet" })],
    ["Bad Account", record({ accountId: "Bad Account" })],
    ["accoryn-unit-extra.testnet", { ...record({ accountId: "accoryn-unit-extra.testnet" }), note: "x" }],
    ["accoryn-unit-short.testnet", record({ accountId: "accoryn-unit-short.testnet", secretKey: "ed25519:abc" })],
    ["accoryn-unit-status.testnet", record({ accountId: "accoryn-unit-status.testnet", status: "unlocked" })],
    ["accoryn-unit-date.testnet", record({ accountId: "accoryn-unit-date.testnet", createdAt: "yesterday" })],
    ["accoryn-unit-near.near", record({ accountId: "accoryn-unit-near.near" })],
    ["accoryn-unit-null.testnet", null],
  ];
  for (const [key, value] of corrupt) await store.put(key, value as never);
  const before = structuredClone(await store.entries());
  const listed = await keystore.list();
  assert.equal(listed.filter((entry) => entry.usable).length, 1);
  const unusable = listed.filter((entry) => !entry.usable);
  assert.deepEqual(unusable.map((entry) => !entry.usable && entry.key).sort(), corrupt.map(([key]) => key).sort());
  assert.doesNotMatch(JSON.stringify(listed), /secretKey|ed25519:[1-9A-HJ-NP-Za-km-z]{80,}/);
  for (const [key] of corrupt) {
    await assert.rejects(keystore.signerFor(key), KeystoreRecordError);
    await assert.rejects(keystore.get(key), KeystoreRecordError);
    await assert.rejects(keystore.prepare(key), (error: unknown) => error instanceof KeystoreRecordError || error instanceof Error);
  }
  assert.deepEqual(await store.entries(), before);
  await keystore.delete("accoryn-unit-v2.testnet");
  assert.equal(await store.get("accoryn-unit-v2.testnet"), undefined);
});

test("validateKeyRecord accepts exactly the version 1 testnet shape", () => {
  const good = record();
  assert.deepEqual(validateKeyRecord(ID, good), good);
  assert.throws(() => validateKeyRecord(ID, { ...good, secretKey: good.secretKey.replace("ed25519:", "secp256k1:") }), KeystoreRecordError);
});

test("markActive requires our full-access key to be visible on chain", async () => {
  const keystore = new Keystore(createMemoryKeyRecordStore());
  const account = await keystore.prepare(ID);
  let view: AccessKeyView | null = null;
  const queried: string[] = [];
  const rpc = {
    viewAccessKey: async (accountId: string, publicKey: string) => {
      queried.push(`${accountId} ${publicKey}`);
      return view;
    },
  };
  await assert.rejects(keystore.markActive(ID, rpc), /not visible/i);
  assert.equal((await keystore.get(ID))?.status, "pending");
  view = { nonce: 1n, permission: { FunctionCall: { allowance: null, receiver_id: "x.testnet", method_names: [] } }, blockHeight: 1, blockHash: "h" };
  await assert.rejects(keystore.markActive(ID, rpc), /full-access/i);
  view = { nonce: 1n, permission: "FullAccess", blockHeight: 1, blockHash: "h" };
  const active = await keystore.markActive(ID, rpc);
  assert.equal(active.status, "active");
  assert.equal((await keystore.get(ID))?.status, "active");
  assert.deepEqual(queried.at(-1), `${ID} ${account.publicKey}`);
});
