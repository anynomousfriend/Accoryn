// Transaction signing determinism (checked against an independent Borsh
// encoding written here from the NEAR protocol spec) and the engine journal's
// state machine. Journal tests use the in-memory record store and the
// IN-MEMORY CHAIN DOUBLE in tests/support/chain-double.ts; live testnet
// behavior is covered by near-live-testnet.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";
import { KeyPairEd25519, KeyPairSigner, actions, baseDecode, baseEncode, base64Decode, decodeSignedTransaction, PublicKey } from "near-api-js";
import type { Signer, Transaction } from "near-api-js";
import {
  TxHashMismatchError,
  TxJournal,
  TxJournalConflictError,
  TxJournalRecordError,
  buildSignedTransaction,
  createMemoryTxRecordStore,
  summarizeActions,
  transactionHash,
} from "../src/engines/near/txjournal.ts";
import type { TxRecord } from "../src/engines/near/txjournal.ts";
import { ChainDouble } from "./support/chain-double.ts";

// ---- independent Borsh (NEAR Transaction V0 with Transfer actions) ---------
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const u64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};
const u128 = (n: bigint) => Buffer.concat([u64(n & ((1n << 64n) - 1n)), u64(n >> 64n)]);
const str = (s: string) => Buffer.concat([u32(Buffer.byteLength(s)), Buffer.from(s, "utf8")]);
function borshTransferTx(signerId: string, publicKey: Uint8Array, nonce: bigint, receiverId: string, blockHash: Uint8Array, deposits: bigint[]): Buffer {
  return Buffer.concat([
    str(signerId),
    Buffer.from([0]), // KeyType::ED25519
    Buffer.from(publicKey),
    u64(nonce),
    str(receiverId),
    Buffer.from(blockHash),
    u32(deposits.length),
    ...deposits.map((d) => Buffer.concat([Buffer.from([3]), u128(d)])), // Action::Transfer = 3
  ]);
}

const SEED = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const SEED_PUBLIC = ed25519.getPublicKey(SEED);
const fixedKey = () => new KeyPairEd25519(baseEncode(new Uint8Array([...SEED, ...SEED_PUBLIC])));
const BLOCK_HASH = baseEncode(Uint8Array.from({ length: 32 }, (_, i) => 255 - i));

test("signing is deterministic and the hash is sha256 of the spec Borsh encoding", async () => {
  const signer = new KeyPairSigner(fixedKey());
  const build = () =>
    buildSignedTransaction({
      signerId: "accoryn-carol.testnet",
      signer,
      receiverId: "accoryn-payee.testnet",
      nonce: 277517772000123n,
      blockHash: BLOCK_HASH,
      actions: [actions.transfer(1n)],
    });
  const first = await build();
  const second = await build();
  assert.equal(first.signedTxBase64, second.signedTxBase64);
  assert.equal(first.txHash, second.txHash);

  const expected = borshTransferTx("accoryn-carol.testnet", SEED_PUBLIC, 277517772000123n, "accoryn-payee.testnet", baseDecode(BLOCK_HASH), [1n]);
  const digest = createHash("sha256").update(expected).digest();
  assert.equal(first.txHash, baseEncode(digest));
  assert.equal(transactionHash(first.transaction), first.txHash);
  // Golden value: any change to encoding or hashing must be deliberate.
  assert.equal(first.txHash, "A4XendiWRtXCYdE21vDyCGLYxxSSj4csirCRXE3LPva8");

  const signed = Buffer.from(base64Decode(first.signedTxBase64));
  assert.deepEqual(signed.subarray(0, expected.length), expected);
  assert.equal(signed[expected.length], 0); // Signature::ED25519
  const signature = signed.subarray(expected.length + 1);
  assert.equal(signature.length, 64);
  assert.ok(ed25519.verify(signature, digest, SEED_PUBLIC));
});

test("action summaries are public-safe and identical for built and decoded actions", async () => {
  const newKey = KeyPairEd25519.fromRandom().getPublicKey();
  const list = [
    actions.createAccount(),
    actions.transfer(10_000_000_000_000_000_000_000n),
    actions.addFullAccessKey(newKey),
    actions.functionCall("add_proposal", { proposal: { description: "x" } }, 50_000_000_000_000n, 100_000_000_000_000_000_000_000n),
  ];
  const summary = summarizeActions(list);
  assert.deepEqual(summary, [
    { type: "CreateAccount" },
    { type: "Transfer", deposit: "10000000000000000000000" },
    { type: "AddKey", publicKey: newKey.toString(), permission: "FullAccess" },
    {
      type: "FunctionCall",
      methodName: "add_proposal",
      argsBytes: 32,
      argsSha256: createHash("sha256").update('{"proposal":{"description":"x"}}').digest("hex"),
      gas: "50000000000000",
      deposit: "100000000000000000000000",
    },
  ]);
  const built = await buildSignedTransaction({ signerId: "a.testnet", signer: new KeyPairSigner(fixedKey()), receiverId: "b.a.testnet", nonce: 1n, blockHash: BLOCK_HASH, actions: list });
  const decoded = decodeSignedTransaction(base64Decode(built.signedTxBase64));
  assert.deepEqual(summarizeActions(decoded.transaction.actions), summary);
  assert.throws(() => summarizeActions([actions.deployContract(new Uint8Array([0, 97, 115, 109]))]), /unsupported/i);
  assert.throws(() => summarizeActions([]), /at least one/i);
});

// ---- journal state machine ------------------------------------------------
const SIGNER = "accoryn-unit-sam.testnet";
const PAYEE = "accoryn-unit-pat.testnet";

function setup(options: { raw?: Map<string, unknown> } = {}) {
  const chain = new ChainDouble();
  const key = KeyPairEd25519.fromRandom();
  const publicKey = key.getPublicKey().toString();
  chain.addKey(SIGNER, publicKey, 5000n);
  const inner = new KeyPairSigner(key);
  let signs = 0;
  const signer: Pick<Signer, "getPublicKey" | "signTransaction"> = {
    getPublicKey: () => inner.getPublicKey(),
    signTransaction: (tx: Transaction) => {
      signs++;
      return inner.signTransaction(tx);
    },
  };
  const raw = options.raw ?? new Map<string, unknown>();
  const store = createMemoryTxRecordStore(raw);
  const journal = new TxJournal(store, { expiryMarginBlocks: 10 });
  const submit = (requestId: string, extra: Record<string, unknown> = {}) =>
    journal.submit({ requestId, kind: "transfer", signerId: SIGNER, signer, receiverId: PAYEE, actions: [actions.transfer(1n)], rpc: chain, ...extra });
  return { chain, publicKey, signer, store, raw, journal, submit, signs: () => signs };
}

test("submit persists the signed record before broadcasting, then records the FINAL outcome", async () => {
  const ctx = setup();
  let seenBeforeSend: TxRecord | null = null;
  ctx.chain.beforeSend = async () => {
    seenBeforeSend = await ctx.journal.get("req-1");
  };
  const result = await ctx.submit("req-1");
  assert.ok(seenBeforeSend);
  assert.equal((seenBeforeSend as TxRecord).status, "signed");
  assert.equal(result.status, "final");
  assert.equal(result.resumed, false);
  assert.equal(result.outcome?.transaction?.hash, result.txHash);
  const record = await ctx.journal.get("req-1");
  assert.ok(record);
  assert.equal(record.status, "final");
  assert.equal(record.nonce, "5001");
  assert.equal(record.txHash, result.txHash);
  assert.equal(record.signedTxBase64, (seenBeforeSend as TxRecord).signedTxBase64);
  assert.deepEqual(record.executionStatus, { SuccessValue: "" });
  assert.deepEqual(record.actionsSummary, [{ type: "Transfer", deposit: "1" }]);
  const decoded = decodeSignedTransaction(base64Decode(record.signedTxBase64));
  assert.equal(transactionHash(decoded.transaction), record.txHash);
  assert.equal(ctx.chain.nonceOf(SIGNER, ctx.publicKey), 5001n);
});

test("resubmitting a requestId never signs a second transaction", async () => {
  const ctx = setup();
  const first = await ctx.submit("req-1");
  const second = await ctx.submit("req-1");
  assert.equal(second.txHash, first.txHash);
  assert.equal(second.status, "final");
  assert.equal(second.resumed, true);
  ctx.chain.lookupsUnavailable = true;
  const third = await ctx.submit("req-1");
  assert.equal(third.status, "final");
  assert.equal(third.txHash, first.txHash);
  assert.equal(ctx.signs(), 1);
  assert.equal(ctx.chain.executed.size, 1);
});

test("concurrent submits share one transaction per requestId and serialize nonces per signer", async () => {
  const ctx = setup();
  const [a, b] = await Promise.all([ctx.submit("req-same"), ctx.submit("req-same")]);
  assert.equal(a.txHash, b.txHash);
  assert.equal(ctx.signs(), 1);
  const [x, y] = await Promise.all([ctx.submit("req-x"), ctx.submit("req-y")]);
  assert.equal(x.status, "final");
  assert.equal(y.status, "final");
  const nonces = [(await ctx.journal.get("req-x"))?.nonce, (await ctx.journal.get("req-y"))?.nonce].sort();
  assert.deepEqual(nonces, ["5002", "5003"]);
  assert.equal(ctx.chain.executed.size, 3);
});

test("a requestId reused for a different intent is refused without signing", async () => {
  const ctx = setup();
  await ctx.submit("req-1");
  await assert.rejects(ctx.submit("req-1", { actions: [actions.transfer(2n)] }), TxJournalConflictError);
  await assert.rejects(ctx.submit("req-1", { receiverId: "accoryn-unit-other.testnet" }), TxJournalConflictError);
  await assert.rejects(ctx.submit("req-1", { kind: "createSubAccount" }), TxJournalConflictError);
  assert.equal(ctx.signs(), 1);
});

test("a broadcast timeout stays submitted and reconciles to final once executed", async () => {
  const ctx = setup();
  ctx.chain.sendMode = "accept-timeout";
  const result = await ctx.submit("req-1");
  assert.equal(result.status, "submitted");
  assert.equal(result.outcome, null);
  assert.deepEqual(result.broadcastError, { type: "TIMEOUT_ERROR", detail: null });
  assert.equal((await ctx.journal.reconcile("req-1", ctx.chain)).status, "pending");
  ctx.chain.executePool();
  const reconciled = await ctx.journal.reconcile("req-1", ctx.chain);
  assert.equal(reconciled.status, "final");
  assert.equal(reconciled.txHash, result.txHash);
  assert.equal(reconciled.outcome?.transaction?.hash, result.txHash);
  assert.equal((await ctx.journal.get("req-1"))?.status, "final");
  assert.equal(ctx.signs(), 1);
});

test("an outage is never a failure; reconcile rebroadcasts the identical stored bytes", async () => {
  const ctx = setup();
  ctx.chain.sendMode = "lost";
  const result = await ctx.submit("req-1");
  assert.equal(result.status, "submitted");
  assert.equal(result.broadcastError?.type, "UNAVAILABLE");
  ctx.chain.sendMode = "execute";
  const reconciled = await ctx.journal.reconcile("req-1", ctx.chain);
  assert.equal(reconciled.status, "final");
  assert.equal(ctx.chain.sent.length, 2);
  assert.equal(ctx.chain.sent[0], ctx.chain.sent[1]);
  assert.equal(ctx.signs(), 1);
});

test("a transaction that executed while its reply was lost is found by hash", async () => {
  const ctx = setup();
  ctx.chain.sendMode = "accepted-then-lost";
  assert.equal((await ctx.submit("req-1")).status, "submitted");
  const reconciled = await ctx.journal.reconcile("req-1", ctx.chain);
  assert.equal(reconciled.status, "final");
  assert.equal(ctx.chain.sent.length, 1);
  // Resubmitting returns the recorded outcome, not a new transaction.
  const again = await ctx.submit("req-1");
  assert.equal(again.status, "final");
  assert.equal(ctx.chain.executed.size, 1);
});

test("an on-chain Failure is recorded as failed and is never retried under the same requestId", async () => {
  const ctx = setup();
  ctx.chain.sendMode = "fail";
  const result = await ctx.submit("req-1");
  assert.equal(result.status, "failed");
  assert.ok(result.outcome?.status && typeof result.outcome.status === "object" && "Failure" in result.outcome.status);
  assert.equal((await ctx.journal.reconcile("req-1", ctx.chain)).status, "failed");
  ctx.chain.sendMode = "execute";
  assert.equal((await ctx.submit("req-1")).status, "failed");
  assert.equal(ctx.signs(), 1);
});

test("expired is decided when another transaction verifiably consumed the nonce", async () => {
  const ctx = setup();
  ctx.chain.sendMode = "lost";
  const result = await ctx.submit("req-1");
  ctx.chain.consumeNonce(SIGNER, ctx.publicKey, 5001n); // a different transaction used nonce 5001
  ctx.chain.sendMode = "execute";
  // Consumption is too recent to be past the safety margin on every endpoint.
  const early = await ctx.journal.reconcile("req-1", ctx.chain);
  assert.equal(early.status, "unknown");
  assert.equal((await ctx.journal.get("req-1"))?.status, "submitted");
  ctx.chain.advance(30);
  const later = await ctx.journal.reconcile("req-1", ctx.chain);
  assert.deepEqual([later.status, later.reason, later.txHash], ["expired", "nonce-consumed", result.txHash]);
  assert.equal((await ctx.journal.get("req-1"))?.status, "expired");
  const resubmitted = await ctx.submit("req-1");
  assert.equal(resubmitted.status, "expired");
  assert.equal(ctx.signs(), 1);
  assert.equal(ctx.chain.executed.size, 0);
});

test("inside the validity window with an unused nonce the outcome stays unknown", async () => {
  const ctx = setup();
  ctx.chain.sendMode = "lost";
  await ctx.submit("req-1");
  ctx.chain.advance(50);
  const reconciled = await ctx.journal.reconcile("req-1", ctx.chain);
  assert.equal(reconciled.status, "unknown");
  assert.equal((await ctx.journal.get("req-1"))?.status, "submitted");
});

test("expired is decided after the validity window only with every endpoint (incl. archival) past it", async () => {
  const ctx = setup();
  ctx.chain.sendMode = "lost";
  const result = await ctx.submit("req-1");
  ctx.chain.advance(200);
  ctx.chain.sendMode = "execute"; // rebroadcast now gets InvalidTxError::Expired
  ctx.chain.endpointLag = [0, 150]; // archival behind the window
  assert.equal((await ctx.journal.reconcile("req-1", ctx.chain)).status, "unknown");
  ctx.chain.endpointLag = [0, 0];
  ctx.chain.withArchival = false; // no archival evidence at all
  assert.equal((await ctx.journal.reconcile("req-1", ctx.chain)).status, "unknown");
  ctx.chain.withArchival = true;
  const reconciled = await ctx.journal.reconcile("req-1", ctx.chain);
  assert.deepEqual([reconciled.status, reconciled.reason, reconciled.txHash], ["expired", "validity-window", result.txHash]);
  assert.equal(ctx.chain.executed.size, 0);
});

test("an RPC outage during reconcile returns unknown and leaves the record unchanged", async () => {
  const ctx = setup();
  ctx.chain.sendMode = "lost";
  await ctx.submit("req-1");
  const before = await ctx.journal.get("req-1");
  ctx.chain.lookupsUnavailable = true;
  ctx.chain.advance(500);
  assert.equal((await ctx.journal.reconcile("req-1", ctx.chain)).status, "unknown");
  assert.deepEqual(await ctx.journal.get("req-1"), before);
  assert.deepEqual(await ctx.journal.reconcile("req-missing", ctx.chain), { requestId: "req-missing", status: "not_found", txHash: null, outcome: null });
});

test("a reported hash that differs from ours is never accepted as final", async () => {
  const ctx = setup();
  ctx.chain.sendMode = "wrong-hash";
  await assert.rejects(ctx.submit("req-1"), TxHashMismatchError);
  const record = await ctx.journal.get("req-1");
  assert.equal(record?.status, "submitted");
  assert.equal(record?.lastError, "HASH_MISMATCH");
});

test("a corrupted journal record blocks submit and reconcile instead of re-signing", async () => {
  const ctx = setup();
  ctx.chain.sendMode = "lost";
  await ctx.submit("req-1");
  const stored = ctx.raw.get("req-1") as TxRecord;
  const bytes = base64Decode(stored.signedTxBase64);
  bytes[bytes.length - 1] ^= 1; // flip a signature bit
  ctx.raw.set("req-1", { ...stored, signedTxBase64: btoa(String.fromCharCode(...bytes)) });
  ctx.raw.set("req-2", { version: 1, requestId: "req-2" });
  await assert.rejects(ctx.submit("req-1"), TxJournalRecordError);
  await assert.rejects(ctx.journal.reconcile("req-1", ctx.chain), TxJournalRecordError);
  await assert.rejects(ctx.submit("req-2"), TxJournalRecordError);
  assert.equal(ctx.signs(), 1);
  const listed = await ctx.journal.list();
  assert.deepEqual(
    listed.map((entry) => [entry.usable, entry.usable ? entry.record.requestId : entry.requestId]).sort(),
    [
      [false, "req-1"],
      [false, "req-2"],
    ],
  );
});

test("an unregistered signing key or an early abort stores and signs nothing", async () => {
  const ctx = setup();
  const stranger = new KeyPairSigner(KeyPairEd25519.fromRandom());
  await assert.rejects(ctx.submit("req-1", { signer: stranger }), /not registered/i);
  await assert.rejects(ctx.submit("req-2", { signal: AbortSignal.abort() }), (error: unknown) => (error as Error).name === "AbortError");
  assert.equal(ctx.raw.size, 0);
  assert.equal(ctx.signs(), 0);
  await assert.rejects(ctx.submit("", {}), /request/i);
  await assert.rejects(ctx.submit("req-3", { signerId: "Not An Account" }), /account/i);
  await assert.rejects(ctx.submit("req-4", { actions: [] }), /at least one/i);
});

test("full-access key additions in a journal record keep the exact public key", async () => {
  const ctx = setup();
  const newcomer = KeyPairEd25519.fromRandom().getPublicKey().toString();
  ctx.chain.sendMode = "lost";
  await ctx.submit("req-sub", {
    kind: "createSubAccount",
    receiverId: `newbie.${SIGNER}`,
    actions: [actions.createAccount(), actions.transfer(1n), actions.addFullAccessKey(PublicKey.fromString(newcomer))],
  });
  const record = await ctx.journal.get("req-sub");
  assert.deepEqual(record?.actionsSummary, [
    { type: "CreateAccount" },
    { type: "Transfer", deposit: "1" },
    { type: "AddKey", publicKey: newcomer, permission: "FullAccess" },
  ]);
});
