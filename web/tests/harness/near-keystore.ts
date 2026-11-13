// Test-only harness: the real IndexedDB keystore and transaction journal in a
// real browser. No network is used. The journal is driven through an in-page
// RPC stand-in whose broadcast always reports an outage, so records stop at
// "submitted" exactly as they would after a lost connection; nothing here is a
// transaction on any chain.
import { KeyPairEd25519, KeyPairSigner, actions } from "near-api-js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { Keystore, KEYSTORE_DB_NAME } from "../../src/engines/near/keystore.ts";
import { TxJournal, TX_JOURNAL_DB_NAME } from "../../src/engines/near/txjournal.ts";
import { RpcUnavailableError } from "../../src/engines/near/rpc.ts";
import type { JournalRpc } from "../../src/engines/near/txjournal.ts";

const keystore = new Keystore();
const journal = new TxJournal();

function withStore<T>(dbName: string, storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(storeName, mode);
      const request = run(tx.objectStore(storeName));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

const offlineSigner = KeyPairEd25519.fromRandom();
const offlineRpc: JournalRpc = {
  viewAccessKey: async () => ({ nonce: 41n, permission: "FullAccess", blockHeight: 100, blockHash: "5nKdpNgEJbAsFAuMXkbtFeiDVVHjHG9j4FkaUFKefVkS" }),
  block: async () => ({ header: { height: 100, hash: "5nKdpNgEJbAsFAuMXkbtFeiDVVHjHG9j4FkaUFKefVkS" } }),
  sendTransaction: async () => {
    throw new RpcUnavailableError("send_tx", [{ endpoint: "offline-harness", reason: "network" }]);
  },
  txStatus: async () => {
    throw new RpcUnavailableError("tx", [{ endpoint: "offline-harness", reason: "network" }]);
  },
  txStatusOnEachEndpoint: async () => {
    throw new RpcUnavailableError("tx", [{ endpoint: "offline-harness", reason: "network" }]);
  },
  transactionValidityPeriod: async () => 86400,
};

Object.assign(window, {
  nearKeystoreHarness: {
    prepare: (accountId: string) => keystore.prepare(accountId),
    get: (accountId: string) => keystore.get(accountId),
    list: () => keystore.list(),
    remove: (accountId: string) => keystore.delete(accountId),
    /** Only the public key leaves this function; the signer stays in the page. */
    signerPublicKey: async (accountId: string) => (await (await keystore.signerFor(accountId)).getPublicKey()).toString(),
    signerError: async (accountId: string) => {
      try {
        await keystore.signerFor(accountId);
        return null;
      } catch (error) {
        return (error as Error).name;
      }
    },
    prepareError: async (accountId: string) => {
      try {
        await keystore.prepare(accountId);
        return null;
      } catch (error) {
        return (error as Error).name;
      }
    },
    /** A digest, so the test can compare stored bytes without reading secrets. */
    rawKeyDigest: async (accountId: string) => {
      const raw = await withStore(KEYSTORE_DB_NAME, "accounts", "readonly", (s) => s.get(accountId));
      return raw === undefined ? null : bytesToHex(sha256(utf8ToBytes(JSON.stringify(raw))));
    },
    corruptKey: async (accountId: string) => {
      const raw = await withStore<Record<string, unknown>>(KEYSTORE_DB_NAME, "accounts", "readonly", (s) => s.get(accountId));
      await withStore(KEYSTORE_DB_NAME, "accounts", "readwrite", (s) => s.put({ ...raw, publicKey: KeyPairEd25519.fromRandom().getPublicKey().toString() }, accountId));
    },
    journalSubmitOffline: (requestId: string) =>
      journal.submit({
        requestId,
        kind: "transfer",
        signerId: "accoryn-harness.testnet",
        signer: new KeyPairSigner(offlineSigner),
        receiverId: "accoryn-payee.testnet",
        actions: [actions.transfer(1n)],
        rpc: offlineRpc,
      }),
    journalGet: (requestId: string) => journal.get(requestId),
    journalList: () => journal.list(),
    journalReconcileOffline: (requestId: string) => journal.reconcile(requestId, offlineRpc),
    journalError: async (requestId: string) => {
      try {
        await journal.get(requestId);
        return null;
      } catch (error) {
        return (error as Error).name;
      }
    },
    corruptJournal: async (requestId: string) => {
      const raw = await withStore<Record<string, unknown>>(TX_JOURNAL_DB_NAME, "transactions", "readonly", (s) => s.get(requestId));
      await withStore(TX_JOURNAL_DB_NAME, "transactions", "readwrite", (s) => s.put({ ...raw, nonce: "42424242" }, requestId));
    },
  },
});
