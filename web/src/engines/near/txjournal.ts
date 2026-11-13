// Engine transaction journal: one signed NEAR transaction per requestId,
// persisted before broadcast, never re-signed, reconciled from chain evidence.
//
// This is separate from the UI's pending-action journal
// (web/src/workspace/action-journal.ts). Records live in IndexedDB
// `accoryn-engine-tx-v1` and hold only public data: signed transaction bytes
// are public once broadcast and contain no secret key.
//
// Transaction hash: base58(sha256(borsh(Transaction))). We compute it
// ourselves, require the signer's returned hash to match, verify the
// signature, and refuse any RPC outcome reporting a different hash.
//
// Status meanings:
//   signed     persisted; a broadcast may or may not have reached a node
//   submitted  broadcast attempted (accepted, timed out, unreachable or refused)
//   final      chain shows the transaction FINAL with a success status
//   failed     chain shows the transaction FINAL with a Failure status
//   expired    verified never executed and never executable (see reconcile)
// Broadcast errors (timeouts, outages, validation refusals) never become
// "failed": a refused copy of the same bytes may still be held and replayed by
// a node while the nonce and reference block remain valid. A "signed" record
// whose broadcast was aborted may still be broadcast later by reconcile; that
// is the same signed intent, and it executes at most once.
import { base64Decode, base64Encode, baseDecode, baseEncode, createTransaction, decodeSignedTransaction, encodeTransaction } from "near-api-js";
import type { Signer, SignedTransaction, Transaction } from "near-api-js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { isAccountId } from "../../workspace/drafts.ts";
import { idbEntries, idbRequest, isConstraintError, resolveIndexedDb } from "./idb.ts";
import { parseEd25519PublicKey } from "./keystore.ts";
import { RpcRequestError, RpcUnavailableError } from "./rpc.ts";
import type { NearRpcClient, TxOutcome, TxWaitUntil } from "./rpc.ts";

export const TX_JOURNAL_DB_NAME = "accoryn-engine-tx-v1";
const STORE_NAME = "transactions";
const U64_MAX = (1n << 64n) - 1n;
const DEFAULT_EXPIRY_MARGIN_BLOCKS = 10;

export type TxRecordStatus = "signed" | "submitted" | "final" | "failed" | "expired";
export type ExpiryReason = "nonce-consumed" | "validity-window";
export type AccessKeySummary = "FullAccess" | { receiverId: string; methodNames: string[]; allowance: string | null };
/** Public-safe description of one action. Function-call arguments are represented by size and SHA-256 only. */
export type ActionSummary =
  | { type: "CreateAccount" }
  | { type: "Transfer"; deposit: string }
  | { type: "FunctionCall"; methodName: string; argsBytes: number; argsSha256: string; gas: string; deposit: string }
  | { type: "AddKey"; publicKey: string; permission: AccessKeySummary }
  | { type: "DeleteKey"; publicKey: string }
  | { type: "DeleteAccount"; beneficiaryId: string };

export type TxRecord = {
  version: 1;
  requestId: string;
  kind: string;
  signerId: string;
  publicKey: string;
  receiverId: string;
  actionsSummary: ActionSummary[];
  txHash: string;
  signedTxBase64: string;
  nonce: string;
  blockHash: string;
  createdAt: string;
  updatedAt: string;
  status: TxRecordStatus;
  /** Last broadcast/consistency problem as a public error kind, e.g. TIMEOUT_ERROR or INVALID_TRANSACTION:InvalidNonce. */
  lastError: string | null;
  /** The chain's `status` object once final/failed. */
  executionStatus: unknown;
  expiredReason: ExpiryReason | null;
};
export type TxJournalEntry = { usable: true; record: TxRecord } | { usable: false; requestId: string; problem: string };

/** Storage adapter; values are returned raw and validated by the journal. */
export interface TxRecordStore {
  get(requestId: string): Promise<unknown>;
  /** Must reject with TxJournalConflictError when a record already exists. */
  create(record: TxRecord): Promise<void>;
  update(record: TxRecord): Promise<void>;
  list(): Promise<Array<[string, unknown]>>;
}

export type JournalRpc = Pick<
  NearRpcClient,
  "viewAccessKey" | "block" | "sendTransaction" | "txStatus" | "txStatusOnEachEndpoint" | "transactionValidityPeriod"
>;
export type JournalSigner = Pick<Signer, "getPublicKey" | "signTransaction">;
type LockManagerLike = {
  request<T>(name: string, options: { mode: "exclusive" }, callback: () => Promise<T>): Promise<T>;
};

export type SubmitInput = {
  requestId: string;
  kind: string;
  signerId: string;
  signer: JournalSigner;
  receiverId: string;
  actions: readonly unknown[];
  rpc: JournalRpc;
  waitUntil?: TxWaitUntil;
  signal?: AbortSignal;
};
export type SubmitResult = {
  requestId: string;
  txHash: string;
  status: TxRecordStatus;
  /** The RPC response when this call obtained one (send_tx or a hash lookup). */
  outcome: TxOutcome | null;
  /** True when the requestId already had a record: nothing new was signed. */
  resumed: boolean;
  broadcastError: { type: string; detail: string | null } | null;
};
export type ReconcileStatus = "final" | "failed" | "expired" | "pending" | "unknown" | "not_found";
export type ReconcileResult = {
  requestId: string;
  status: ReconcileStatus;
  txHash: string | null;
  outcome: TxOutcome | null;
  reason?: ExpiryReason;
};

// ---- errors -----------------------------------------------------------------
export class TxJournalRecordError extends Error {
  readonly requestId: string;
  readonly problem: string;
  constructor(requestId: string, problem: string) {
    super("A stored transaction record is unusable. It was left unchanged and blocks this request.");
    this.name = "TxJournalRecordError";
    this.requestId = requestId;
    this.problem = problem;
  }
}
export class TxJournalConflictError extends Error {
  constructor() {
    super("This request ID was already used for a different transaction.");
    this.name = "TxJournalConflictError";
  }
}
export class TxHashMismatchError extends Error {
  constructor() {
    super("The network reported a different transaction hash; the outcome was not accepted.");
    this.name = "TxHashMismatchError";
  }
}
export class TxSignerKeyError extends Error {
  constructor() {
    super("This signing key is not registered on the signer account.");
    this.name = "TxSignerKeyError";
  }
}

// ---- pure helpers -------------------------------------------------------------
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isAbort = (error: unknown) => (error as { name?: unknown })?.name === "AbortError";
const isRpcFailure = (error: unknown) => error instanceof RpcRequestError || error instanceof RpcUnavailableError;
const unsupported = (): never => {
  throw new Error("Unsupported transaction action.");
};

function decimal(value: unknown): string {
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) return value;
  return unsupported();
}

function bytesOf(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) return Uint8Array.from(value);
  return unsupported();
}

function publicKeyText(value: unknown): string {
  if (!isObject(value) || !isObject(value.ed25519Key)) return unsupported();
  const data = bytesOf(value.ed25519Key.data);
  if (data.length !== 32) return unsupported();
  return "ed25519:" + baseEncode(data);
}

function variant(action: unknown): [string, unknown] {
  if (!isObject(action)) return unsupported();
  const present = Object.keys(action).filter((key) => key !== "enum" && action[key] !== undefined && action[key] !== null);
  if (present.length !== 1) return unsupported();
  return [present[0], action[present[0]]];
}

/** Public-safe summary of near-api-js actions, for both built and Borsh-decoded forms. */
export function summarizeActions(list: readonly unknown[]): ActionSummary[] {
  if (!Array.isArray(list) || list.length === 0) throw new Error("A transaction needs at least one action.");
  return list.map((action): ActionSummary => {
    const [name, body] = variant(action);
    const value = isObject(body) ? body : unsupported();
    switch (name) {
      case "createAccount":
        return { type: "CreateAccount" };
      case "transfer":
        return { type: "Transfer", deposit: decimal(value.deposit) };
      case "functionCall": {
        if (typeof value.methodName !== "string" || !value.methodName) return unsupported();
        const args = bytesOf(value.args);
        return {
          type: "FunctionCall",
          methodName: value.methodName,
          argsBytes: args.length,
          argsSha256: bytesToHex(sha256(args)),
          gas: decimal(value.gas),
          deposit: decimal(value.deposit),
        };
      }
      case "addKey": {
        const accessKey = isObject(value.accessKey) ? value.accessKey : unsupported();
        const [permissionName, permission] = variant(accessKey.permission);
        if (permissionName === "fullAccess") return { type: "AddKey", publicKey: publicKeyText(value.publicKey), permission: "FullAccess" };
        if (permissionName !== "functionCall" || !isObject(permission)) return unsupported();
        const methodNames = permission.methodNames;
        if (typeof permission.receiverId !== "string" || !Array.isArray(methodNames) || !methodNames.every((m) => typeof m === "string"))
          return unsupported();
        const allowance = permission.allowance === undefined || permission.allowance === null ? null : decimal(permission.allowance);
        return {
          type: "AddKey",
          publicKey: publicKeyText(value.publicKey),
          permission: { receiverId: permission.receiverId, methodNames: [...(methodNames as string[])], allowance },
        };
      }
      case "deleteKey":
        return { type: "DeleteKey", publicKey: publicKeyText(value.publicKey) };
      case "deleteAccount":
        if (typeof value.beneficiaryId !== "string") return unsupported();
        return { type: "DeleteAccount", beneficiaryId: value.beneficiaryId };
      default:
        return unsupported();
    }
  });
}

/** base58(sha256(borsh(transaction))): the NEAR transaction hash. */
export function transactionHash(transaction: Transaction): string {
  return baseEncode(sha256(encodeTransaction(transaction)));
}

/** Builds and signs one transaction, cross-checking the signer's hash and signature. Persists nothing. */
export async function buildSignedTransaction(input: {
  signerId: string;
  signer: JournalSigner;
  receiverId: string;
  nonce: bigint;
  blockHash: string;
  actions: readonly unknown[];
}): Promise<{ txHash: string; signedTxBase64: string; transaction: Transaction; signedTransaction: SignedTransaction }> {
  const publicKey = await input.signer.getPublicKey();
  if (!publicKey.toString().startsWith("ed25519:")) throw new Error("Only ed25519 signing keys are supported.");
  const blockHash = baseDecode(input.blockHash);
  if (blockHash.length !== 32) throw new Error("Invalid reference block hash.");
  summarizeActions(input.actions);
  const transaction = createTransaction(input.signerId, publicKey, input.receiverId, input.nonce, [...input.actions] as never[], blockHash);
  const expected = transactionHash(transaction);
  const { txHash, signedTransaction } = await input.signer.signTransaction(transaction);
  if (baseEncode(txHash) !== expected) throw new TxHashMismatchError();
  if (!publicKey.verify(baseDecode(expected), signedTransaction.signature.data)) throw new Error("The signer produced an invalid signature.");
  return { txHash: expected, signedTxBase64: base64Encode(encodeTransaction(signedTransaction)), transaction, signedTransaction };
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const KIND = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const ERROR_KIND = /^[A-Za-z0-9_:]{1,100}$/;
const RECORD_KEYS = [
  "actionsSummary",
  "blockHash",
  "createdAt",
  "executionStatus",
  "expiredReason",
  "kind",
  "lastError",
  "nonce",
  "publicKey",
  "receiverId",
  "requestId",
  "signedTxBase64",
  "signerId",
  "status",
  "txHash",
  "updatedAt",
  "version",
];
const STATUSES: readonly TxRecordStatus[] = ["signed", "submitted", "final", "failed", "expired"];

function hash32(value: unknown): boolean {
  if (typeof value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  try {
    return baseDecode(value).length === 32;
  } catch {
    return false;
  }
}

function successStatus(status: unknown): boolean {
  return isObject(status) && ("SuccessValue" in status || "SuccessReceiptId" in status);
}
function failureStatus(status: unknown): boolean {
  return isObject(status) && "Failure" in status;
}

/**
 * Validates a raw stored record, including that its signed bytes decode, carry
 * a valid signature, hash to `txHash` and match every denormalized field.
 */
export function validateTxRecord(key: string, value: unknown): TxRecord {
  const fail = (problem: string): never => {
    throw new TxJournalRecordError(key, problem);
  };
  if (!isObject(value)) return fail("not-an-object");
  if (Object.keys(value).sort().join("|") !== RECORD_KEYS.join("|")) return fail("unexpected-fields");
  const r = value as Record<string, unknown>;
  if (r.version !== 1) return fail("version");
  if (typeof r.requestId !== "string" || r.requestId !== key || !REQUEST_ID.test(r.requestId)) return fail("request-id");
  if (typeof r.kind !== "string" || !KIND.test(r.kind)) return fail("kind");
  if (typeof r.signerId !== "string" || !isAccountId(r.signerId)) return fail("signer-id");
  if (typeof r.receiverId !== "string" || !isAccountId(r.receiverId)) return fail("receiver-id");
  if (!parseEd25519PublicKey(r.publicKey)) return fail("public-key");
  if (!hash32(r.txHash)) return fail("tx-hash");
  if (!hash32(r.blockHash)) return fail("block-hash");
  if (typeof r.nonce !== "string" || !/^[1-9]\d*$/.test(r.nonce) || BigInt(r.nonce) > U64_MAX) return fail("nonce");
  for (const field of ["createdAt", "updatedAt"])
    if (typeof r[field] !== "string" || !Number.isFinite(Date.parse(r[field] as string))) return fail("timestamp");
  if (!STATUSES.includes(r.status as TxRecordStatus)) return fail("status");
  if (r.lastError !== null && (typeof r.lastError !== "string" || !ERROR_KIND.test(r.lastError))) return fail("last-error");
  if (r.status === "final" ? !successStatus(r.executionStatus) : r.status === "failed" ? !failureStatus(r.executionStatus) : r.executionStatus !== null)
    return fail("execution-status");
  if (r.status === "expired" ? r.expiredReason !== "nonce-consumed" && r.expiredReason !== "validity-window" : r.expiredReason !== null)
    return fail("expired-reason");
  if (typeof r.signedTxBase64 !== "string" || r.signedTxBase64.length > 20_000) return fail("signed-bytes");

  let signed: SignedTransaction;
  try {
    const bytes = base64Decode(r.signedTxBase64);
    if (base64Encode(bytes) !== r.signedTxBase64) return fail("signed-bytes");
    signed = decodeSignedTransaction(bytes);
  } catch (error) {
    if (error instanceof TxJournalRecordError) throw error;
    return fail("signed-bytes");
  }
  const tx = signed.transaction;
  if (tx.nonceIndex !== undefined || tx.nonceMode !== undefined) return fail("transaction-version");
  if (tx.signerId !== r.signerId || tx.receiverId !== r.receiverId) return fail("transaction-accounts");
  if (tx.publicKey.toString() !== r.publicKey) return fail("transaction-key");
  if (tx.nonce.toString() !== r.nonce) return fail("transaction-nonce");
  if (baseEncode(bytesOf(tx.blockHash)) !== r.blockHash) return fail("transaction-block");
  if (transactionHash(tx) !== r.txHash) return fail("transaction-hash");
  if (!tx.publicKey.verify(baseDecode(r.txHash), signed.signature.data)) return fail("transaction-signature");
  let summary: ActionSummary[];
  try {
    summary = summarizeActions(tx.actions);
  } catch {
    return fail("transaction-actions");
  }
  if (JSON.stringify(summary) !== JSON.stringify(r.actionsSummary)) return fail("actions-summary");
  return structuredClone(value) as TxRecord;
}

function classifyOutcome(outcome: TxOutcome, txHash: string): "final" | "failed" | "pending" {
  if (outcome.transaction?.hash !== txHash || outcome.final_execution_status !== "FINAL") return "pending";
  if (successStatus(outcome.status)) return "final";
  if (failureStatus(outcome.status)) return "failed";
  return "pending";
}

// ---- locks ------------------------------------------------------------------
const localTails = new Map<string, Promise<void>>();

function defaultLocks(): LockManagerLike | null {
  const nav = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator;
  return nav?.locks ?? null;
}

/** Web Lock `accoryn-signer:<signerId>` (cross-tab); in-process queue when Web Locks are absent. */
async function withSignerLock<T>(locks: LockManagerLike | null, signerId: string, run: () => Promise<T>): Promise<T> {
  const name = `accoryn-signer:${signerId}`;
  if (locks) return locks.request(name, { mode: "exclusive" }, run);
  const previous = localTails.get(name) ?? Promise.resolve();
  let release!: () => void;
  const tail = previous.then(() => new Promise<void>((resolve) => (release = resolve)));
  localTails.set(name, tail);
  await previous;
  try {
    return await run();
  } finally {
    release();
    if (localTails.get(name) === tail) localTails.delete(name);
  }
}

// ---- journal ------------------------------------------------------------------
export class TxJournal {
  readonly #store: TxRecordStore;
  readonly #locks: LockManagerLike | null;
  readonly #now: () => Date;
  readonly #margin: number;

  constructor(
    store: TxRecordStore = createIndexedDbTxRecordStore(),
    options: { locks?: LockManagerLike | null; now?: () => Date; expiryMarginBlocks?: number } = {},
  ) {
    this.#store = store;
    this.#locks = options.locks === undefined ? defaultLocks() : options.locks;
    this.#now = options.now ?? (() => new Date());
    this.#margin = options.expiryMarginBlocks ?? DEFAULT_EXPIRY_MARGIN_BLOCKS;
  }

  async #read(requestId: string): Promise<TxRecord | null> {
    const raw = await this.#store.get(requestId);
    return raw === undefined ? null : validateTxRecord(requestId, raw);
  }

  async #update(record: TxRecord, patch: Partial<Pick<TxRecord, "status" | "lastError" | "executionStatus" | "expiredReason">>): Promise<TxRecord> {
    if (record.status === "final" || record.status === "failed" || record.status === "expired")
      throw new Error("A settled transaction record cannot change.");
    const next: TxRecord = { ...record, ...patch, updatedAt: this.#now().toISOString() };
    validateTxRecord(next.requestId, next);
    await this.#store.update(next);
    return next;
  }

  /** The validated record for a requestId, or null. Throws TxJournalRecordError for an unusable record. */
  async get(requestId: string): Promise<TxRecord | null> {
    return this.#read(requestId);
  }

  async list(): Promise<TxJournalEntry[]> {
    return (await this.#store.list()).map(([requestId, value]): TxJournalEntry => {
      try {
        return { usable: true, record: validateTxRecord(requestId, value) };
      } catch (error) {
        if (!(error instanceof TxJournalRecordError)) throw error;
        return { usable: false, requestId, problem: error.problem };
      }
    });
  }

  /**
   * Signs and broadcasts at most one transaction per requestId. A requestId
   * that already has a record is never re-signed: its recorded outcome is
   * returned or its stored bytes are rebroadcast. Reusing a requestId for a
   * different intent throws TxJournalConflictError.
   */
  async submit(input: SubmitInput): Promise<SubmitResult> {
    if (typeof input.requestId !== "string" || !REQUEST_ID.test(input.requestId)) throw new Error("A valid request ID is required.");
    if (typeof input.kind !== "string" || !KIND.test(input.kind)) throw new Error("A valid transaction kind is required.");
    if (typeof input.signerId !== "string" || !isAccountId(input.signerId) || typeof input.receiverId !== "string" || !isAccountId(input.receiverId))
      throw new Error("Signer and receiver must be valid NEAR account IDs.");
    const summary = summarizeActions(input.actions);
    const waitUntil = input.waitUntil ?? "FINAL";
    const { signal, rpc } = input;
    return withSignerLock(this.#locks, input.signerId, async () => {
      const existing = await this.#read(input.requestId);
      if (existing) {
        if (
          existing.kind !== input.kind ||
          existing.signerId !== input.signerId ||
          existing.receiverId !== input.receiverId ||
          JSON.stringify(existing.actionsSummary) !== JSON.stringify(summary)
        )
          throw new TxJournalConflictError();
        return this.#resume(existing, rpc, waitUntil, signal);
      }
      signal?.throwIfAborted();
      const publicKey = (await input.signer.getPublicKey()).toString();
      const key = await rpc.viewAccessKey(input.signerId, publicKey, { finality: "optimistic", signal });
      if (!key) throw new TxSignerKeyError();
      const head = await rpc.block({ finality: "final" }, { signal });
      signal?.throwIfAborted();
      const built = await buildSignedTransaction({
        signerId: input.signerId,
        signer: input.signer,
        receiverId: input.receiverId,
        nonce: key.nonce + 1n,
        blockHash: head.header.hash,
        actions: input.actions,
      });
      const now = this.#now().toISOString();
      const record: TxRecord = {
        version: 1,
        requestId: input.requestId,
        kind: input.kind,
        signerId: input.signerId,
        publicKey,
        receiverId: input.receiverId,
        actionsSummary: summary,
        txHash: built.txHash,
        signedTxBase64: built.signedTxBase64,
        nonce: (key.nonce + 1n).toString(),
        blockHash: head.header.hash,
        createdAt: now,
        updatedAt: now,
        status: "signed",
        lastError: null,
        executionStatus: null,
        expiredReason: null,
      };
      validateTxRecord(record.requestId, record);
      await this.#store.create(record); // persisted before any broadcast
      return this.#broadcast(record, rpc, waitUntil, signal, false);
    });
  }

  async #resume(record: TxRecord, rpc: JournalRpc, waitUntil: TxWaitUntil, signal: AbortSignal | undefined): Promise<SubmitResult> {
    const base = { requestId: record.requestId, txHash: record.txHash, resumed: true, broadcastError: null };
    if (record.status === "expired") return { ...base, status: "expired", outcome: null };
    let outcome: TxOutcome | null = null;
    try {
      outcome = await rpc.txStatus(record.txHash, record.signerId, "NONE", { signal });
    } catch (error) {
      if (isAbort(error)) throw error;
      if (!isRpcFailure(error)) throw error;
    }
    if (outcome && outcome.transaction?.hash !== record.txHash) outcome = null;
    if (record.status === "final" || record.status === "failed") return { ...base, status: record.status, outcome };
    if (outcome) {
      const verdict = classifyOutcome(outcome, record.txHash);
      if (verdict !== "pending") {
        await this.#update(record, { status: verdict, executionStatus: outcome.status, lastError: null });
        return { ...base, status: verdict, outcome };
      }
    }
    return this.#broadcast(record, rpc, waitUntil, signal, true);
  }

  async #broadcast(record: TxRecord, rpc: JournalRpc, waitUntil: TxWaitUntil, signal: AbortSignal | undefined, resumed: boolean): Promise<SubmitResult> {
    const base = { requestId: record.requestId, txHash: record.txHash, resumed };
    let outcome: TxOutcome;
    try {
      outcome = await rpc.sendTransaction(record.signedTxBase64, waitUntil, { signal });
    } catch (error) {
      // An abort leaves the record as is: the bytes may or may not have reached a node.
      if (isAbort(error) || !isRpcFailure(error)) throw error;
      const type = error instanceof RpcRequestError ? error.type : "UNAVAILABLE";
      const detail = error instanceof RpcRequestError ? error.invalidTxKind : null;
      await this.#update(record, { status: "submitted", lastError: detail ? `${type}:${detail}` : type });
      return { ...base, status: "submitted", outcome: null, broadcastError: { type, detail } };
    }
    if (outcome.transaction?.hash !== undefined && outcome.transaction.hash !== record.txHash) {
      await this.#update(record, { status: "submitted", lastError: "HASH_MISMATCH" });
      throw new TxHashMismatchError();
    }
    const verdict = classifyOutcome(outcome, record.txHash);
    if (verdict === "pending") {
      await this.#update(record, { status: "submitted", lastError: null });
      return { ...base, status: "submitted", outcome, broadcastError: null };
    }
    await this.#update(record, { status: verdict, executionStatus: outcome.status, lastError: null });
    return { ...base, status: verdict, outcome, broadcastError: null };
  }

  /**
   * Read-only with respect to funds: it never signs. It may rebroadcast the
   * identical stored bytes once (same hash and nonce, so at most one execution).
   *
   * Decision table (in order):
   * 1. No local record                                  -> not_found
   * 2. Record expired                                    -> expired (terminal)
   * 3. Hash lookup (primary, then archival) unavailable  -> unknown (record unchanged)
   *    Record final/failed                               -> that status (+ outcome when found)
   * 4. Found FINAL with success / Failure                -> final / failed (persisted)
   *    Found but not FINAL                               -> pending
   * 5. Not found: rebroadcast once with wait INCLUDED (validated by the node)
   *    included / TIMEOUT_ERROR (validated, not yet in a block) -> pending
   *    FINAL outcome returned                            -> final / failed
   *    a bare NONE acknowledgement                       -> no evidence; continue to 6
   * 6. Rebroadcast refused or unreachable: expired ONLY with chain evidence
   *    a) nonce-consumed: at final head H, the access key's nonce read at
   *       block H - 2*margin is >= our nonce (another transaction used it), or
   *    b) validity-window: final head > height(reference block) + validity
   *       period (EXPERIMENTAL_protocol_config) + margin,
   *    AND every primary and archival endpoint (at least one archival)
   *    reports UNKNOWN_TRANSACTION while its own final head is past the
   *    evidence height ((H - 2*margin) + margin, or the window end + margin).
   * 7. Anything else (incl. any RPC error during 6)      -> unknown (record unchanged)
   * A timeout is never converted into failure.
   */
  async reconcile(requestId: string, rpc: JournalRpc, options: { signal?: AbortSignal } = {}): Promise<ReconcileResult> {
    if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) throw new Error("A valid request ID is required.");
    const notFound: ReconcileResult = { requestId, status: "not_found", txHash: null, outcome: null };
    const first = await this.#read(requestId);
    if (!first) return notFound;
    const { signal } = options;
    return withSignerLock(this.#locks, first.signerId, async () => {
      const record = await this.#read(requestId);
      if (!record) return notFound;
      const result = (status: ReconcileStatus, outcome: TxOutcome | null = null, reason?: ExpiryReason): ReconcileResult =>
        reason ? { requestId, status, txHash: record.txHash, outcome, reason } : { requestId, status, txHash: record.txHash, outcome };
      if (record.status === "expired") return result("expired", null, record.expiredReason ?? undefined);

      let found: TxOutcome | null;
      try {
        found = await rpc.txStatus(record.txHash, record.signerId, "NONE", { signal });
      } catch (error) {
        if (isAbort(error) || !isRpcFailure(error)) throw error;
        return record.status === "final" || record.status === "failed" ? result(record.status) : result("unknown");
      }
      if (found && found.transaction?.hash !== record.txHash) return result("unknown");
      if (record.status === "final" || record.status === "failed") return result(record.status, found);
      if (found) return this.#settle(record, found, result);

      // INCLUDED, not NONE: testnet answers send_tx/NONE with {"final_execution_status":"NONE"}
      // without validating (even for a consumed nonce), so a NONE reply carries no evidence.
      // INCLUDED validates first: invalid bytes fail at once, valid ones wait for inclusion.
      try {
        const echoed = await rpc.sendTransaction(record.signedTxBase64, "INCLUDED", { signal });
        if (echoed.transaction?.hash !== undefined && echoed.transaction.hash !== record.txHash) return result("unknown");
        if (echoed.final_execution_status !== "NONE") return this.#settle(record, echoed, result);
      } catch (error) {
        if (isAbort(error) || !isRpcFailure(error)) throw error;
        if (error instanceof RpcRequestError && error.type === "TIMEOUT_ERROR") {
          if (record.status === "signed") await this.#update(record, { status: "submitted", lastError: "TIMEOUT_ERROR" });
          return result("pending");
        }
      }

      let evidence: { reason: ExpiryReason; minHead: number } | null;
      let checks: Awaited<ReturnType<JournalRpc["txStatusOnEachEndpoint"]>>;
      try {
        evidence = await this.#expiryEvidence(record, rpc, signal);
        if (!evidence) return result("unknown");
        checks = await rpc.txStatusOnEachEndpoint(record.txHash, record.signerId, { signal });
      } catch (error) {
        if (isAbort(error) || !isRpcFailure(error)) throw error;
        return result("unknown");
      }
      const { reason, minHead } = evidence;
      const seen = checks.find((check) => check.outcome !== null);
      if (seen?.outcome) {
        if (seen.outcome.transaction?.hash !== record.txHash) return result("unknown");
        return this.#settle(record, seen.outcome, result);
      }
      const verified =
        checks.some((check) => check.archival) && checks.every((check) => check.outcome === null && check.headHeight >= minHead);
      if (!verified) return result("unknown");
      await this.#update(record, { status: "expired", expiredReason: reason });
      return result("expired", null, reason);
    });
  }

  async #settle(
    record: TxRecord,
    outcome: TxOutcome,
    result: (status: ReconcileStatus, outcome?: TxOutcome | null) => ReconcileResult,
  ): Promise<ReconcileResult> {
    const verdict = classifyOutcome(outcome, record.txHash);
    if (verdict === "pending") {
      if (record.status === "signed") await this.#update(record, { status: "submitted", lastError: null });
      return result("pending", outcome);
    }
    await this.#update(record, { status: verdict, executionStatus: outcome.status, lastError: null });
    return result(verdict, outcome);
  }

  /** Chain facts proving the stored bytes can no longer be included, or null. */
  async #expiryEvidence(record: TxRecord, rpc: JournalRpc, signal: AbortSignal | undefined): Promise<{ reason: ExpiryReason; minHead: number } | null> {
    const head = (await rpc.block({ finality: "final" }, { signal })).header.height;
    const observedAt = head - 2 * this.#margin;
    if (observedAt > 0) {
      try {
        const key = await rpc.viewAccessKey(record.signerId, record.publicKey, { blockId: observedAt, signal });
        if (key && key.nonce >= BigInt(record.nonce)) return { reason: "nonce-consumed", minHead: observedAt + this.#margin };
      } catch (error) {
        // e.g. a pruned block or a deleted account: no nonce evidence, try the validity window.
        if (!(error instanceof RpcRequestError)) throw error;
      }
    }
    const reference = (await rpc.block({ blockId: record.blockHash }, { signal })).header;
    if (reference.hash !== record.blockHash) return null;
    const period = await rpc.transactionValidityPeriod({ signal });
    const windowEnd = reference.height + period + this.#margin;
    if (head > windowEnd) return { reason: "validity-window", minHead: windowEnd };
    return null;
  }
}

// ---- storage adapters ------------------------------------------------------------

/** In-memory adapter (tests, scripts). Values are cloned like IndexedDB structured clones. */
export function createMemoryTxRecordStore(backing: Map<string, unknown> = new Map()): TxRecordStore {
  return {
    get: async (requestId) => (backing.has(requestId) ? structuredClone(backing.get(requestId)) : undefined),
    create: async (record) => {
      if (backing.has(record.requestId)) throw new TxJournalConflictError();
      backing.set(record.requestId, structuredClone(record));
    },
    update: async (record) => {
      if (!backing.has(record.requestId)) throw new Error("Transaction record is missing.");
      backing.set(record.requestId, structuredClone(record));
    },
    list: async () => [...backing].map(([key, value]): [string, unknown] => [key, structuredClone(value)]),
  };
}

/** IndexedDB adapter for `accoryn-engine-tx-v1` (object store `transactions`, keyed by requestId). */
export function createIndexedDbTxRecordStore(factory?: IDBFactory): TxRecordStore {
  const run = <T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>) =>
    idbRequest(resolveIndexedDb(factory), TX_JOURNAL_DB_NAME, STORE_NAME, mode, op);
  return {
    get: (requestId) => run("readonly", (s) => s.get(requestId)),
    create: async (record) => {
      try {
        await run("readwrite", (s) => s.add(record, record.requestId));
      } catch (error) {
        if (isConstraintError(error)) throw new TxJournalConflictError();
        throw error;
      }
    },
    update: async (record) => {
      await run("readwrite", (s) => s.put(record, record.requestId));
    },
    list: () => idbEntries(resolveIndexedDb(factory), TX_JOURNAL_DB_NAME, STORE_NAME),
  };
}
