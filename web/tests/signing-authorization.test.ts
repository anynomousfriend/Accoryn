import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyPairEd25519, KeyPairSigner, actions } from "near-api-js";
import {
  TxJournal,
  createMemoryTxRecordStore,
} from "../src/engines/near/txjournal.ts";
import { ChainDouble } from "./support/chain-double.ts";
import { guardedSigner } from "../src/engines/app/signing-authorization.ts";
// Deterministic chain double controls the delayed RPC boundary. The keypair,
// transaction signing and journal are real; this is not testnet evidence.
test("authorization is rechecked at signing after delayed nonce/block RPC, not only before the journal", async () => {
  for (const reason of ["expired", "template-replaced", "cancelled"] as const) {
    const key = KeyPairEd25519.fromRandom(),
      inner = new KeyPairSigner(key);
    const chain = new ChainDouble();
    chain.addKey("alice.testnet", key.getPublicKey().toString(), 1n);
    let allowed = true,
      signs = 0;
    const abort = new AbortController();
    const signer = guardedSigner(
      {
        getPublicKey: () => inner.getPublicKey(),
        signTransaction: (tx) => {
          signs++;
          return inner.signTransaction(tx);
        },
      },
      async () => {
        if (!allowed) throw new Error(reason);
      },
      abort.signal,
    );
    const block = chain.block.bind(chain);
    chain.block = async (...args) => {
      const result = await block(...args);
      if (reason === "cancelled") abort.abort();
      else allowed = false;
      return result;
    };
    const journal = new TxJournal(createMemoryTxRecordStore(), { locks: null });
    await assert.rejects(() =>
      journal.submit({
        requestId: reason,
        kind: "attest",
        signerId: "alice.testnet",
        receiverId: "gate.testnet",
        signer,
        actions: [actions.transfer(1n)],
        rpc: chain,
        signal: abort.signal,
      }),
    );
    assert.equal(signs, 0, reason);
    assert.equal(await journal.get(reason), null);
    assert.equal(chain.sent.length, 0);
  }
});
