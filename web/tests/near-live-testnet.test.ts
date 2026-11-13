// LIVE NEAR TESTNET. Skipped unless ACCORYN_LIVE_TESTNET=1.
//
// Sends one real 1-yoctoNEAR transfer from accoryn-carol.testnet to
// accoryn-payee.testnet through the engine journal, reconciles it, then submits
// the same requestId again and checks that no second transaction exists. A
// second test drops one signed transaction before delivery, lets a later
// journaled transfer consume its nonce, and checks that reconcile reports it
// expired from real RPC evidence (one more 1-yocto transfer). The
// signing key is read from the developer's near-cli keychain inside this test
// only and is never printed. Concurrent activity on the payee account by other
// scripts would break the exact-balance assertion; rerun if that happens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { KeyPairSigner, actions } from "near-api-js";
import type { KeyPairString } from "near-api-js";
import { NearRpcClient, RpcUnavailableError } from "../src/engines/near/rpc.ts";
import { TxJournal, createMemoryTxRecordStore } from "../src/engines/near/txjournal.ts";
import type { JournalRpc } from "../src/engines/near/txjournal.ts";

const live = process.env.ACCORYN_LIVE_TESTNET === "1";
const SENDER = "accoryn-carol.testnet";
const PAYEE = "accoryn-payee.testnet";

function signerFromKeychain(accountId: string): KeyPairSigner {
  const file = join(homedir(), ".near-credentials", "testnet", `${accountId}.json`);
  const { private_key: secret } = JSON.parse(readFileSync(file, "utf8")) as { private_key: KeyPairString };
  return KeyPairSigner.fromSecretKey(secret);
}

test(
  "live testnet: one journaled 1-yocto transfer, reconciled final, never duplicated",
  { skip: live ? false : "set ACCORYN_LIVE_TESTNET=1 to run against NEAR testnet", timeout: 180_000 },
  async () => {
    const rpc = new NearRpcClient();
    const journal = new TxJournal(createMemoryTxRecordStore());
    const signer = signerFromKeychain(SENDER);
    const requestId = `live-${crypto.randomUUID()}`;
    const before = BigInt((await rpc.viewAccount(PAYEE)).amount);
    const input = { requestId, kind: "transfer", signerId: SENDER, signer, receiverId: PAYEE, actions: [actions.transfer(1n)], rpc };

    const first = await journal.submit(input);
    assert.equal(first.status, "final", `first submit status ${first.status}`);
    // The journal already refuses a mismatch; assert the RPC's own hash explicitly.
    assert.equal(first.outcome?.transaction?.hash, first.txHash);
    console.log(`live testnet tx: ${first.txHash} https://testnet.nearblocks.io/txns/${first.txHash}`);

    const reconciled = await journal.reconcile(requestId, rpc);
    assert.equal(reconciled.status, "final");
    assert.equal(reconciled.txHash, first.txHash);

    const second = await journal.submit(input);
    assert.equal(second.resumed, true);
    assert.equal(second.status, "final");
    assert.equal(second.txHash, first.txHash);

    // Chain evidence: the transaction exists with our signer/receiver and exactly one 1-yocto transfer.
    const status = await rpc.txStatus(first.txHash, SENDER, "FINAL", { receipts: true });
    assert.ok(status);
    assert.equal(status.transaction?.signer_id, SENDER);
    assert.equal(status.transaction?.receiver_id, PAYEE);
    const record = await journal.get(requestId);
    assert.equal(record?.status, "final");
    assert.equal(String(status.transaction?.nonce), record?.nonce);

    const after = BigInt((await rpc.viewAccount(PAYEE)).amount);
    assert.equal(after - before, 1n, `payee balance changed by ${after - before} yoctoNEAR`);
  },
);

test(
  "live testnet: a never-delivered transaction whose nonce is consumed reconciles to expired",
  { skip: live ? false : "set ACCORYN_LIVE_TESTNET=1 to run against NEAR testnet", timeout: 240_000 },
  async () => {
    const rpc = new NearRpcClient();
    // Real reads; only this client's broadcast is dropped, as if the connection failed before sending.
    const dropping: JournalRpc = {
      viewAccessKey: rpc.viewAccessKey.bind(rpc),
      block: rpc.block.bind(rpc),
      txStatus: rpc.txStatus.bind(rpc),
      txStatusOnEachEndpoint: rpc.txStatusOnEachEndpoint.bind(rpc),
      transactionValidityPeriod: rpc.transactionValidityPeriod.bind(rpc),
      sendTransaction: async () => {
        throw new RpcUnavailableError("send_tx", [{ endpoint: "dropped-by-test", reason: "network" }]);
      },
    };
    const journal = new TxJournal(createMemoryTxRecordStore());
    const signer = signerFromKeychain(SENDER);
    const lostId = `live-lost-${crypto.randomUUID()}`;
    const usedId = `live-used-${crypto.randomUUID()}`;
    const input = { kind: "transfer", signerId: SENDER, signer, receiverId: PAYEE, actions: [actions.transfer(1n)] };
    const before = BigInt((await rpc.viewAccount(PAYEE)).amount);

    const lost = await journal.submit({ ...input, requestId: lostId, rpc: dropping });
    assert.equal(lost.status, "submitted");
    // The next transaction from the same key takes the same nonce, because the first never landed.
    const used = await journal.submit({ ...input, requestId: usedId, rpc });
    assert.equal(used.status, "final");
    assert.equal((await journal.get(usedId))?.nonce, (await journal.get(lostId))?.nonce);
    console.log(`live testnet nonce-consuming tx: ${used.txHash}; never-delivered tx: ${lost.txHash}`);

    let verdict = await journal.reconcile(lostId, rpc);
    const deadline = Date.now() + 120_000;
    while (verdict.status === "unknown" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      verdict = await journal.reconcile(lostId, rpc);
    }
    assert.deepEqual([verdict.status, verdict.reason], ["expired", "nonce-consumed"]);
    assert.equal(await rpc.txStatus(lost.txHash, SENDER), null);
    const after = BigInt((await rpc.viewAccount(PAYEE)).amount);
    assert.equal(after - before, 1n, `payee balance changed by ${after - before} yoctoNEAR`);
  },
);
