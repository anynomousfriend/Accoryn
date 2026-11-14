// App-made NEAR testnet accounts.
//
// Primary path: the public testnet helper (the faucet route used by
// near-cli-rs) creates `<label>.testnet` for a public key generated in this
// browser. It allows browser CORS and funds each account (~10 testnet NEAR,
// observed 2026-11-13). Creation counts only once the chain shows OUR key on
// the account; helper HTTP status codes are never treated as authority.
//
// Fallback path: an existing member funds `<label>.<their account>` for a
// newcomer's public key in one journaled transaction
// (CreateAccount + Transfer + AddKey(FullAccess)).
//
// Neither path returns or logs secret material; callers pass public keys only.
import { actions, PublicKey } from "near-api-js";
import type { Signer } from "near-api-js";
import { isAccountId } from "../../workspace/drafts.ts";
import { parseEd25519PublicKey } from "./keystore.ts";
import { RpcRequestError } from "./rpc.ts";
import type { NearRpcClient, RpcCallOptions } from "./rpc.ts";
import type { JournalRpc, TxJournal } from "./txjournal.ts";

export const TESTNET_HELPER_URL = "https://helper.nearprotocol.com/account";
const LABEL = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const U128_MAX = (1n << 128n) - 1n;

export type AccountIdCheck = { ok: true; accountId: string; label: string } | { ok: false; reason: "format" | "length" };
type AccountReader = Pick<NearRpcClient, "viewAccount" | "viewAccessKey">;

function checkLabel(label: string, parent: string): AccountIdCheck {
  if (label.length < 2 || label.length > 32) return { ok: false, reason: "length" };
  if (!LABEL.test(label)) return { ok: false, reason: "format" };
  const accountId = `${label}.${parent}`;
  if (accountId.length > 64) return { ok: false, reason: "length" };
  if (!isAccountId(accountId)) return { ok: false, reason: "format" };
  return { ok: true, accountId, label };
}

/**
 * A new top-level testnet name: `label` or `label.testnet`, where label is
 * 2..32 characters of a-z/0-9 joined by single `-` or `_` separators.
 */
export function validateNewAccountId(name: string): AccountIdCheck {
  if (typeof name !== "string") return { ok: false, reason: "format" };
  const label = name.endsWith(".testnet") ? name.slice(0, -".testnet".length) : name;
  return checkLabel(label, "testnet");
}

/** `<label>.<parent>` with one label under an existing testnet parent account. */
export function validateSubAccountId(newAccountId: string, parentAccountId: string): AccountIdCheck {
  if (typeof newAccountId !== "string" || typeof parentAccountId !== "string") return { ok: false, reason: "format" };
  if (!isAccountId(parentAccountId) || !parentAccountId.endsWith(".testnet")) return { ok: false, reason: "format" };
  const suffix = `.${parentAccountId}`;
  if (!newAccountId.endsWith(suffix)) return { ok: false, reason: "format" };
  return checkLabel(newAccountId.slice(0, -suffix.length), parentAccountId);
}

async function accountExists(rpc: AccountReader, accountId: string, options: RpcCallOptions): Promise<boolean> {
  try {
    await rpc.viewAccount(accountId, { ...options, finality: "final" });
    return true;
  } catch (error) {
    if (error instanceof RpcRequestError && error.type === "UNKNOWN_ACCOUNT") return false;
    throw error;
  }
}

/** True when the chain reports UNKNOWN_ACCOUNT. Other errors propagate. */
export async function isAccountAvailable(rpc: Pick<NearRpcClient, "viewAccount">, accountId: string, options: RpcCallOptions = {}): Promise<boolean> {
  return !(await accountExists(rpc as AccountReader, accountId, options));
}

type Ownership = "ours" | "taken" | "absent";

async function ownership(rpc: AccountReader, accountId: string, publicKey: string, options: RpcCallOptions): Promise<Ownership> {
  try {
    if (await rpc.viewAccessKey(accountId, publicKey, { ...options, finality: "final" })) return "ours";
  } catch (error) {
    if (error instanceof RpcRequestError && error.type === "UNKNOWN_ACCOUNT") return "absent";
    throw error;
  }
  try {
    const account = await rpc.viewAccount(accountId, { ...options, finality: "final" });
    // Creation can land between the first key query and account query. A missing
    // key from an older block is not proof that the newly visible account is taken.
    const key = await rpc.viewAccessKey(accountId, publicKey, { ...options, blockId: account.blockHash });
    return key ? "ours" : "taken";
  } catch (error) {
    if (error instanceof RpcRequestError && error.type === "UNKNOWN_ACCOUNT") return "absent";
    throw error;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Polls until the chain shows our key, someone else's account, or the deadline passes. */
async function waitForOwnership(
  rpc: AccountReader,
  accountId: string,
  publicKey: string,
  deadlineMs: number,
  intervalMs: number,
  signal: AbortSignal | undefined,
): Promise<Ownership> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    const state = await ownership(rpc, accountId, publicKey, { signal });
    if (state !== "absent" || Date.now() >= deadline) return state;
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())), signal);
  }
}

export type HelperCreateResult =
  | { status: "created"; accountId: string; publicKey: string; alreadyExisted: boolean }
  /** The account exists with keys that are not ours. */
  | { status: "taken"; accountId: string }
  /** The helper refused (HTTP 4xx) and the chain shows no such account. Retrying later with the same key is safe. */
  | { status: "rejected"; accountId: string; httpStatus: number; retryAfterSeconds?: number }
  /** The outcome is not yet visible (helper accepted, timed out or was unreachable). Re-check later; do not assume failure. */
  | { status: "unconfirmed"; accountId: string };

/** Bounded provider hints only; never interpolate arbitrary upstream response text. */
export function helperRetryAfterSeconds(headers: Pick<Headers, "get">, body: string, now = Date.now()): number | undefined {
  const value = headers.get("retry-after")?.trim();
  const seconds = value ? (/^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000)) : NaN;
  if (Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 31_536_000) return seconds;
  const match = body.trim().slice(0, 256).match(/^Rate limit exceeded, retry in (\d+) (seconds?|minutes?|hours?|days?)\.?$/i);
  if (!match) return undefined;
  const unit = match[2].toLowerCase();
  const delay = Number(match[1]) * (unit.startsWith("day") ? 86400 : unit.startsWith("hour") ? 3600 : unit.startsWith("minute") ? 60 : 1);
  return Number.isSafeInteger(delay) && delay >= 0 && delay <= 31_536_000 ? delay : undefined;
}
export function helperRefusalMessage(result: Extract<HelperCreateResult, {status: "rejected"}>): string {
  if (result.httpStatus !== 429) return `Testnet helper refused creation (HTTP ${result.httpStatus}). The name and original key are retained; resume this request later.`;
  const seconds = result.retryAfterSeconds;
  const wait = seconds === undefined ? "Wait for the faucet cooldown" : seconds >= 3600 ? `Wait about ${Math.ceil(seconds / 3600)} hours` : seconds >= 60 ? `Wait about ${Math.ceil(seconds / 60)} minutes` : `Wait about ${seconds} seconds`;
  return `The free testnet account faucet is rate-limited (HTTP 429). ${wait} before Resume original request. Your username and original key are retained. This is the funding service's limit, not an object scan failure; changing RPC providers does not remove it. Reconcile the original request before retrying; do not clear browser data.`;
}

/**
 * Creates `<label>.testnet` for `publicKey` through the testnet helper and
 * confirms it on chain. Idempotent: an account that already holds our key is
 * "created" without calling the helper. Aborting stops waiting; it cannot
 * cancel a helper request that was already sent.
 */
export async function createViaTestnetHelper(input: {
  accountId: string;
  publicKey: string;
  rpc: AccountReader;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  helperUrl?: string;
  confirmTimeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<HelperCreateResult> {
  const check = validateNewAccountId(input.accountId);
  if (!check.ok || check.accountId !== input.accountId) throw new Error("Choose a valid testnet account name (2-32 lowercase letters, digits, - or _).");
  if (!parseEd25519PublicKey(input.publicKey)) throw new Error("A valid ed25519 public key is required.");
  const { accountId, publicKey, rpc, signal } = input;
  const confirmTimeoutMs = input.confirmTimeoutMs ?? 60_000;
  const pollIntervalMs = input.pollIntervalMs ?? 1_500;

  const before = await ownership(rpc, accountId, publicKey, { signal });
  if (before === "ours") return { status: "created", accountId, publicKey, alreadyExisted: true };
  if (before === "taken") return { status: "taken", accountId };

  const doFetch = input.fetch ?? ((url, init) => globalThis.fetch(url, init));
  let httpStatus: number | null = null;
  let retryAfterSeconds: number | undefined;
  try {
    const response = await doFetch(input.helperUrl ?? TESTNET_HELPER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
      signal,
    });
    httpStatus = response.status;
    // The body is not authority and may contain upstream detail; drain and ignore it.
    const body = await response.text().catch(() => "");
    if (httpStatus === 429) retryAfterSeconds = helperRetryAfterSeconds(response.headers, body);
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    httpStatus = null; // network failure: the helper may still have processed it
  }

  const definitiveRefusal = httpStatus !== null && httpStatus >= 400 && httpStatus < 500;
  // A refusal gets a short re-check (a racing creation may still land); anything else gets the full window.
  const windowMs = definitiveRefusal ? Math.min(confirmTimeoutMs, 5_000) : confirmTimeoutMs;
  const after = await waitForOwnership(rpc, accountId, publicKey, windowMs, pollIntervalMs, signal);
  if (after === "ours") return { status: "created", accountId, publicKey, alreadyExisted: false };
  if (after === "taken") return { status: "taken", accountId };
  if (definitiveRefusal) return { status: "rejected", accountId, httpStatus: httpStatus as number, ...(retryAfterSeconds === undefined ? {} : {retryAfterSeconds}) };
  return { status: "unconfirmed", accountId };
}

export type SubAccountResult =
  | { status: "created"; accountId: string; publicKey: string; txHash: string | null; alreadyExisted: boolean }
  | { status: "taken"; accountId: string }
  /** Executed on chain and failed (e.g., the name was taken first). Funds other than gas were refunded by the protocol. */
  | { status: "failed"; accountId: string; txHash: string }
  /** Verified never executed. A retry needs a new requestId. */
  | { status: "expired"; accountId: string; txHash: string }
  /** Broadcast but not yet final, or outcome unknown: reconcile with the same requestId. */
  | { status: "pending"; accountId: string; txHash: string };

/**
 * An existing member (`parentAccountId`, signing with `signer`) creates and
 * funds `<label>.<parent>` with `publicKey` as its full-access key, through the
 * transaction journal (one transaction per requestId, never re-signed).
 */
export async function createSubAccount(input: {
  journal: TxJournal;
  requestId: string;
  parentAccountId: string;
  signer: Pick<Signer, "getPublicKey" | "signTransaction">;
  newAccountId: string;
  publicKey: string;
  amountAtomic: string;
  rpc: JournalRpc & AccountReader;
  signal?: AbortSignal;
}): Promise<SubAccountResult> {
  const check = validateSubAccountId(input.newAccountId, input.parentAccountId);
  if (!check.ok) throw new Error("Choose a valid sub-account name directly under your account.");
  if (!parseEd25519PublicKey(input.publicKey)) throw new Error("A valid ed25519 public key is required.");
  if (typeof input.amountAtomic !== "string" || !/^[1-9]\d*$/.test(input.amountAtomic) || BigInt(input.amountAtomic) > U128_MAX)
    throw new Error("Funding must be a positive yoctoNEAR amount.");
  const { journal, requestId, newAccountId: accountId, publicKey, rpc, signal } = input;

  const known = await journal.get(requestId);
  if (!known) {
    // Nothing signed for this request yet: do not spend on a name that is already settled.
    const state = await ownership(rpc, accountId, publicKey, { signal });
    if (state === "ours") return { status: "created", accountId, publicKey, txHash: null, alreadyExisted: true };
    if (state === "taken") return { status: "taken", accountId };
  }
  const result = await journal.submit({
    requestId,
    kind: "createSubAccount",
    signerId: input.parentAccountId,
    signer: input.signer,
    receiverId: accountId,
    actions: [actions.createAccount(), actions.transfer(BigInt(input.amountAtomic)), actions.addFullAccessKey(PublicKey.fromString(publicKey))],
    rpc,
    waitUntil: "FINAL",
    signal,
  });
  if (result.status === "final") {
    const state = await ownership(rpc, accountId, publicKey, { signal });
    if (state === "ours") return { status: "created", accountId, publicKey, txHash: result.txHash, alreadyExisted: false };
    return { status: "pending", accountId, txHash: result.txHash };
  }
  if (result.status === "failed") {
    const state = await ownership(rpc, accountId, publicKey, { signal });
    return state === "taken" ? { status: "taken", accountId } : { status: "failed", accountId, txHash: result.txHash };
  }
  if (result.status === "expired") return { status: "expired", accountId, txHash: result.txHash };
  return { status: "pending", accountId, txHash: result.txHash };
}
