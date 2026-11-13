// Local keystore for app-made NEAR testnet accounts.
//
// DISCLOSED LIMITS — read before relying on this module:
// - Each account's ed25519 FULL-ACCESS secret key is stored as extractable
//   key material (the near-api-js `ed25519:<base58>` string) in this origin's
//   IndexedDB database `accoryn-engine-keys-v1`. It is not encrypted. Anything
//   that can run script in this origin, browser extensions with page access,
//   and anyone with access to the unlocked browser profile can read it.
// - The camera object scan the app offers is a local convenience gate in the
//   UI only. It is NOT encryption, not a key-derivation input and not
//   authentication; it does not protect these bytes.
// - Clearing site data deletes the key. Recovery is by DAO governance replacing
//   the lost member, not by this keystore.
// - Testnet only. The security boundary is the on-chain ceremony gate plus DAO
//   policy, not local storage.
//
// Secret material leaves storage only through `signerFor()`, which returns a
// near-api-js KeyPairSigner held in memory. Listings and view models never
// carry the secret key. Records are validated on every read; a record that
// fails validation is reported as unusable and is never rewritten or "fixed".
import { KeyPairEd25519, KeyPairSigner, baseDecode, PublicKey } from "near-api-js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { isAccountId } from "../../workspace/drafts.ts";
import { idbEntries, idbRequest, isConstraintError, resolveIndexedDb } from "./idb.ts";
import type { NearRpcClient, RpcCallOptions } from "./rpc.ts";

export const KEYSTORE_DB_NAME = "accoryn-engine-keys-v1";
const STORE_NAME = "accounts";

export type KeyStatus = "pending" | "active";
export type StoredKeyRecord = {
  version: 1;
  network: "testnet";
  accountId: string;
  publicKey: string;
  /** `ed25519:` + base58(32-byte seed || 32-byte public key). Never leaves this module except via signerFor. */
  secretKey: string;
  createdAt: string;
  status: KeyStatus;
};
/** Public view of a stored key: no secret material. */
export type KeystoreAccount = {
  network: "testnet";
  accountId: string;
  publicKey: string;
  createdAt: string;
  status: KeyStatus;
};
export type KeystoreListEntry =
  | { usable: true; account: KeystoreAccount }
  | { usable: false; key: string; problem: string };

/** Storage adapter. Values are returned raw; the keystore validates them. */
export interface KeyRecordStore {
  get(accountId: string): Promise<unknown>;
  /** Must reject with KeystoreConflictError when a record already exists. */
  add(accountId: string, record: StoredKeyRecord): Promise<void>;
  put(accountId: string, record: StoredKeyRecord): Promise<void>;
  delete(accountId: string): Promise<void>;
  entries(): Promise<Array<[string, unknown]>>;
}

export class KeystoreRecordError extends Error {
  readonly key: string;
  readonly problem: string;
  constructor(key: string, problem: string) {
    super("A stored account key is unusable and was left unchanged.");
    this.name = "KeystoreRecordError";
    this.key = key;
    this.problem = problem;
  }
}
export class KeystoreConflictError extends Error {
  constructor() {
    super("A key for this account is already stored.");
    this.name = "KeystoreConflictError";
  }
}
export class KeystoreMissingError extends Error {
  constructor() {
    super("No key is stored for this account.");
    this.name = "KeystoreMissingError";
  }
}
export class KeystoreNotConfirmedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeystoreNotConfirmedError";
  }
}

const RECORD_KEYS = ["accountId", "createdAt", "network", "publicKey", "secretKey", "status", "version"];
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

function decodeBase58(text: string): Uint8Array | null {
  if (!BASE58.test(text)) return null;
  try {
    return baseDecode(text);
  } catch {
    return null;
  }
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

export function isTestnetAccountId(accountId: unknown): accountId is string {
  return typeof accountId === "string" && isAccountId(accountId) && accountId.endsWith(".testnet");
}

/** Parses an `ed25519:<base58 32 bytes>` public key, or returns null. */
export function parseEd25519PublicKey(text: unknown): Uint8Array | null {
  if (typeof text !== "string" || !text.startsWith("ed25519:")) return null;
  const bytes = decodeBase58(text.slice("ed25519:".length));
  return bytes && bytes.length === 32 ? bytes : null;
}

/** Validates a raw stored value against the exact version 1 shape. Throws KeystoreRecordError. */
export function validateKeyRecord(key: string, value: unknown): StoredKeyRecord {
  const fail = (problem: string): never => {
    throw new KeystoreRecordError(key, problem);
  };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail("not-an-object");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("|") !== RECORD_KEYS.join("|")) return fail("unexpected-fields");
  if (record.version !== 1) return fail("version");
  if (record.network !== "testnet") return fail("network");
  if (!isTestnetAccountId(record.accountId)) return fail("account-id");
  if (record.accountId !== key) return fail("key-mismatch");
  if (record.status !== "pending" && record.status !== "active") return fail("status");
  if (typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) return fail("created-at");
  const publicKey = parseEd25519PublicKey(record.publicKey);
  if (!publicKey) return fail("public-key");
  if (typeof record.secretKey !== "string" || !record.secretKey.startsWith("ed25519:")) return fail("secret-key");
  const secret = decodeBase58(record.secretKey.slice("ed25519:".length));
  if (!secret || secret.length !== 64) return fail("secret-key");
  // The stored public half, the derived public key and the record's public key must all agree.
  const derived = ed25519.getPublicKey(secret.slice(0, 32));
  if (!sameBytes(derived, publicKey) || !sameBytes(secret.slice(32), publicKey)) return fail("key-pair-mismatch");
  return {
    version: 1,
    network: "testnet",
    accountId: record.accountId,
    publicKey: record.publicKey as string,
    secretKey: record.secretKey,
    createdAt: record.createdAt,
    status: record.status,
  };
}

const toAccount = (record: StoredKeyRecord): KeystoreAccount => ({
  network: record.network,
  accountId: record.accountId,
  publicKey: record.publicKey,
  createdAt: record.createdAt,
  status: record.status,
});

export class Keystore {
  readonly #store: KeyRecordStore;
  readonly #now: () => Date;

  constructor(store: KeyRecordStore = createIndexedDbKeyRecordStore(), options: { now?: () => Date } = {}) {
    this.#store = store;
    this.#now = options.now ?? (() => new Date());
  }

  async #read(accountId: string): Promise<StoredKeyRecord | null> {
    const raw = await this.#store.get(accountId);
    return raw === undefined ? null : validateKeyRecord(accountId, raw);
  }

  /** Generates and stores a new pending key. Fails if any record (even an unusable one) exists. */
  async generate(accountId: string): Promise<KeystoreAccount> {
    if (!isTestnetAccountId(accountId)) throw new Error("Choose a valid testnet account ID.");
    const pair = KeyPairEd25519.fromRandom();
    const record: StoredKeyRecord = {
      version: 1,
      network: "testnet",
      accountId,
      publicKey: pair.getPublicKey().toString(),
      secretKey: pair.toString(),
      createdAt: this.#now().toISOString(),
      status: "pending",
    };
    validateKeyRecord(accountId, record);
    await this.#store.add(accountId, record);
    return toAccount(record);
  }

  /** The existing usable key for this account, or a newly generated pending one. Retry-safe. */
  async prepare(accountId: string): Promise<KeystoreAccount> {
    if (!isTestnetAccountId(accountId)) throw new Error("Choose a valid testnet account ID.");
    const existing = await this.#read(accountId);
    if (existing) return toAccount(existing);
    try {
      return await this.generate(accountId);
    } catch (error) {
      // Another tab may have generated it first; use theirs, never overwrite.
      if (!(error instanceof KeystoreConflictError)) throw error;
      const winner = await this.#read(accountId);
      if (!winner) throw error;
      return toAccount(winner);
    }
  }

  /** Public view of one account's key, or null. Throws KeystoreRecordError for an unusable record. */
  async get(accountId: string): Promise<KeystoreAccount | null> {
    const record = await this.#read(accountId);
    return record ? toAccount(record) : null;
  }

  /** Every stored record; unusable ones are reported, not hidden or repaired. Never includes secrets. */
  async list(): Promise<KeystoreListEntry[]> {
    const entries = await this.#store.entries();
    return entries
      .map(([key, value]): KeystoreListEntry => {
        try {
          return { usable: true, account: toAccount(validateKeyRecord(key, value)) };
        } catch (error) {
          if (!(error instanceof KeystoreRecordError)) throw error;
          return { usable: false, key, problem: error.problem };
        }
      })
      .sort((a, b) => (a.usable ? a.account.accountId : a.key).localeCompare(b.usable ? b.account.accountId : b.key));
  }

  /** Marks the key active only after the chain shows it as a FullAccess key on that account. */
  async markActive(accountId: string, rpc: Pick<NearRpcClient, "viewAccessKey">, options: RpcCallOptions = {}): Promise<KeystoreAccount> {
    const record = await this.#read(accountId);
    if (!record) throw new KeystoreMissingError();
    const view = await rpc.viewAccessKey(accountId, record.publicKey, { ...options, finality: "final" });
    if (!view) throw new KeystoreNotConfirmedError("This account's key is not visible on testnet yet.");
    if (view.permission !== "FullAccess") throw new KeystoreNotConfirmedError("This account's key is not a full-access key on testnet.");
    if (record.status === "active") return toAccount(record);
    const active: StoredKeyRecord = { ...record, status: "active" };
    await this.#store.put(accountId, active);
    return toAccount(active);
  }

  /** Permanently deletes the local key (also for unusable records). Without another key, the account is lost. */
  async delete(accountId: string): Promise<void> {
    await this.#store.delete(accountId);
  }

  /** The only way secret material leaves storage: an in-memory near-api-js signer. */
  async signerFor(accountId: string): Promise<KeyPairSigner> {
    const record = await this.#read(accountId);
    if (!record) throw new KeystoreMissingError();
    const signer = KeyPairSigner.fromSecretKey(record.secretKey as `ed25519:${string}`);
    if ((await signer.getPublicKey()).toString() !== PublicKey.fromString(record.publicKey).toString())
      throw new KeystoreRecordError(accountId, "key-pair-mismatch");
    return signer;
  }
}

// ---- storage adapters ------------------------------------------------------

/** In-memory adapter (tests, or a deliberate non-persistent session). Values are cloned like IndexedDB. */
export function createMemoryKeyRecordStore(backing: Map<string, unknown> = new Map()): KeyRecordStore {
  return {
    get: async (accountId) => (backing.has(accountId) ? structuredClone(backing.get(accountId)) : undefined),
    add: async (accountId, record) => {
      if (backing.has(accountId)) throw new KeystoreConflictError();
      backing.set(accountId, structuredClone(record));
    },
    put: async (accountId, record) => {
      backing.set(accountId, structuredClone(record));
    },
    delete: async (accountId) => {
      backing.delete(accountId);
    },
    entries: async () => [...backing].map(([key, value]): [string, unknown] => [key, structuredClone(value)]),
  };
}

/** IndexedDB adapter for `accoryn-engine-keys-v1` (object store `accounts`, keyed by account ID). */
export function createIndexedDbKeyRecordStore(factory?: IDBFactory): KeyRecordStore {
  const run = <T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>) =>
    idbRequest(resolveIndexedDb(factory), KEYSTORE_DB_NAME, STORE_NAME, mode, op);
  return {
    get: (accountId) => run("readonly", (s) => s.get(accountId)),
    add: async (accountId, record) => {
      try {
        await run("readwrite", (s) => s.add(record, accountId));
      } catch (error) {
        if (isConstraintError(error)) throw new KeystoreConflictError();
        throw error;
      }
    },
    put: async (accountId, record) => {
      await run("readwrite", (s) => s.put(record, accountId));
    },
    delete: async (accountId) => {
      await run("readwrite", (s) => s.delete(accountId));
    },
    entries: () => idbEntries(resolveIndexedDb(factory), KEYSTORE_DB_NAME, STORE_NAME),
  };
}
