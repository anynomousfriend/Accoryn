// Browser-safe NEAR testnet JSON-RPC client (fetch only; no Buffer/fs/process).
//
// Endpoints are tried in order. Only transport-level problems move on to the
// next endpoint: network errors, our per-request timeout, HTTP responses that
// are not JSON-RPC (proxy pages, 5xx/429) and INTERNAL_ERROR. A JSON-RPC error
// from a node is an answer, not an outage, and is thrown as RpcRequestError
// without trying other endpoints. Resending identical signed bytes to another
// endpoint is safe: they have one hash and one nonce, so they execute at most once.
//
// Observed on testnet 2026-11-13 and handled here:
// - view_access_key / call_function failures arrive as a *result* with an
//   `error` string (HTTP 200), not as a JSON-RPC error.
// - `tx` with any wait_until other than NONE stalls on unknown hashes until a
//   server timeout (HTTP 408 TIMEOUT_ERROR after ~10-14 s; some endpoints never
//   answer within 25 s). `NONE` answers UNKNOWN_TRANSACTION immediately.
// - Request-validation errors arrive with HTTP 400 and a JSON-RPC body.
// - EXPERIMENTAL_protocol_config and EXPERIMENTAL_genesis_config both report
//   transaction_validity_period = 86400 blocks.
//
// Error messages are public-safe: method names and error kinds only.
import { base64Encode } from "near-api-js";

export const TESTNET_RPC_ENDPOINTS: readonly string[] = Object.freeze([
  "https://rpc.testnet.fastnear.com",
  "https://rpc.testnet.near.org",
]);
export const TESTNET_ARCHIVAL_ENDPOINTS: readonly string[] = Object.freeze(["https://archival-rpc.testnet.fastnear.com"]);

const DEFAULT_TIMEOUT_MS = 15_000;
/** Above the ~10-14 s server-side wait for send_tx / tx with a non-NONE wait. */
const WAITING_TIMEOUT_MS = 30_000;

export type TxWaitUntil = "NONE" | "INCLUDED" | "EXECUTED_OPTIMISTIC" | "INCLUDED_FINAL" | "EXECUTED" | "FINAL";
export type Finality = "optimistic" | "near-final" | "final";
export type BlockReference = { finality: Finality } | { blockId: string | number };
export type EndpointSet = "primary" | "archival" | "primary-then-archival";
export type RpcCallOptions = { signal?: AbortSignal; timeoutMs?: number };
export type StateReadOptions = RpcCallOptions & { finality?: Finality; blockId?: string | number };

export type RpcAttemptFailure = {
  endpoint: string;
  reason: "network" | "timeout" | "http" | "malformed" | "internal";
  status?: number;
};

export type AccessKeyPermissionView =
  | "FullAccess"
  | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } };
export type AccessKeyView = {
  nonce: bigint;
  permission: AccessKeyPermissionView;
  blockHeight: number;
  blockHash: string;
};
export type AccessKeyListEntry = { publicKey: string; nonce: bigint; permission: AccessKeyPermissionView };
export type AccountView = {
  amount: string;
  locked: string;
  codeHash: string;
  storageUsage: number;
  blockHeight: number;
  blockHash: string;
};
export type BlockView = {
  header: { height: number; hash: string; [field: string]: unknown };
  [field: string]: unknown;
};
/** RPC `tx` / `send_tx` result. Only the fields the engines read are typed. */
export type TxOutcome = {
  final_execution_status?: string;
  status?: unknown;
  transaction?: { hash?: string; signer_id?: string; receiver_id?: string; nonce?: number; [field: string]: unknown };
  transaction_outcome?: unknown;
  receipts_outcome?: unknown[];
  receipts?: unknown[];
  [field: string]: unknown;
};
export type EndpointTxCheck = { endpoint: string; archival: boolean; headHeight: number; outcome: TxOutcome | null };

type JsonRpcErrorBody = { name?: unknown; cause?: { name?: unknown; info?: unknown }; code?: unknown; message?: unknown; data?: unknown };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every endpoint failed at the transport level (network, timeout, 5xx, non-JSON-RPC). */
export class RpcUnavailableError extends Error {
  readonly method: string;
  readonly failures: readonly RpcAttemptFailure[];
  constructor(method: string, failures: readonly RpcAttemptFailure[]) {
    super(`NEAR RPC ${method} is unavailable on every configured endpoint.`);
    this.name = "RpcUnavailableError";
    this.method = method;
    this.failures = failures;
  }
}

/** A node answered with a JSON-RPC error (or a typed error the client derived from its answer). */
export class RpcRequestError extends Error {
  readonly method: string;
  readonly endpoint: string;
  readonly httpStatus: number | null;
  /** Top-level JSON-RPC error name, e.g. HANDLER_ERROR or REQUEST_VALIDATION_ERROR. */
  readonly rpcName: string | null;
  /** Specific cause, e.g. UNKNOWN_ACCOUNT, UNKNOWN_TRANSACTION, TIMEOUT_ERROR, INVALID_TRANSACTION. */
  readonly causeName: string | null;
  readonly code: number | null;
  /** Public chain data supplied by the node (`cause.info`). */
  readonly info: unknown;
  readonly data: unknown;
  constructor(input: { method: string; endpoint: string; httpStatus: number | null; error: JsonRpcErrorBody }) {
    const rpcName = typeof input.error.name === "string" ? input.error.name : null;
    const causeName = isObject(input.error.cause) && typeof input.error.cause.name === "string" ? input.error.cause.name : null;
    super(`NEAR RPC ${input.method} failed: ${causeName ?? rpcName ?? "UNKNOWN_ERROR"}.`);
    this.name = "RpcRequestError";
    this.method = input.method;
    this.endpoint = input.endpoint;
    this.httpStatus = input.httpStatus;
    this.rpcName = rpcName;
    this.causeName = causeName;
    this.code = typeof input.error.code === "number" ? input.error.code : null;
    this.info = isObject(input.error.cause) ? input.error.cause.info : undefined;
    this.data = input.error.data;
  }
  get type(): string {
    return this.causeName ?? this.rpcName ?? "UNKNOWN_ERROR";
  }
  /** For INVALID_TRANSACTION: the InvalidTxError variant, e.g. InvalidNonce, Expired, NotEnoughBalance. */
  get invalidTxKind(): string | null {
    for (const source of [this.info, this.data]) {
      if (!isObject(source)) continue;
      const container = isObject(source.TxExecutionError) ? source.TxExecutionError : source;
      const invalid = container.InvalidTxError;
      if (typeof invalid === "string") return invalid;
      if (isObject(invalid)) {
        const [first] = Object.keys(invalid);
        if (first) return first;
      }
    }
    return null;
  }
}

const derivedError = (method: string, endpoint: string, causeName: string, info?: unknown) =>
  new RpcRequestError({ method, endpoint, httpStatus: 200, error: { name: "CLIENT_ERROR", cause: { name: causeName, info } } });

function abortError(signal: AbortSignal): unknown {
  return signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted.", "AbortError");
}

const isAbort = (error: unknown) => (error as { name?: unknown })?.name === "AbortError";

type Attempt = { kind: "result"; value: unknown; endpoint: string } | { kind: "failure"; failure: RpcAttemptFailure };

export type NearRpcClientOptions = {
  endpoints?: readonly string[];
  archivalEndpoints?: readonly string[];
  timeoutMs?: number;
  fetch?: typeof fetch;
};

export class NearRpcClient {
  readonly endpoints: readonly string[];
  readonly archivalEndpoints: readonly string[];
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  #requestId = 0;
  #validityPeriod: number | null = null;

  constructor(options: NearRpcClientOptions = {}) {
    this.endpoints = Object.freeze([...(options.endpoints ?? TESTNET_RPC_ENDPOINTS)]);
    this.archivalEndpoints = Object.freeze([...(options.archivalEndpoints ?? TESTNET_ARCHIVAL_ENDPOINTS)]);
    if (this.endpoints.length === 0) throw new Error("At least one NEAR RPC endpoint is required.");
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const injected = options.fetch;
    this.#fetch = injected ?? ((input, init) => globalThis.fetch(input, init));
  }

  #resolve(set: EndpointSet | readonly string[]): readonly string[] {
    if (Array.isArray(set)) return set;
    if (set === "archival") return this.archivalEndpoints;
    if (set === "primary-then-archival") return [...this.endpoints, ...this.archivalEndpoints];
    return this.endpoints;
  }

  async #attempt(endpoint: string, method: string, params: unknown, options: RpcCallOptions): Promise<Attempt> {
    const caller = options.signal;
    if (caller?.aborted) throw abortError(caller);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("NEAR RPC request timed out.", "TimeoutError"));
    }, options.timeoutMs ?? this.#timeoutMs);
    const onAbort = () => controller.abort(caller?.reason);
    caller?.addEventListener("abort", onAbort, { once: true });
    const id = `accoryn-${++this.#requestId}`;
    try {
      let response: Response;
      let text: string;
      try {
        response = await this.#fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          signal: controller.signal,
        });
        text = await response.text();
      } catch (error) {
        if (caller?.aborted) throw abortError(caller);
        return { kind: "failure", failure: { endpoint, reason: timedOut ? "timeout" : "network" } };
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return {
          kind: "failure",
          failure: response.ok ? { endpoint, reason: "malformed" } : { endpoint, reason: "http", status: response.status },
        };
      }
      if (isObject(body) && isObject(body.error)) {
        const error = body.error as JsonRpcErrorBody;
        const internal = error.name === "INTERNAL_ERROR" || (isObject(error.cause) && error.cause.name === "INTERNAL_ERROR");
        if (internal) return { kind: "failure", failure: { endpoint, reason: "internal", status: response.status } };
        throw new RpcRequestError({ method, endpoint, httpStatus: response.status, error });
      }
      if (isObject(body) && "result" in body) return { kind: "result", value: body.result, endpoint };
      return {
        kind: "failure",
        failure: response.ok ? { endpoint, reason: "malformed" } : { endpoint, reason: "http", status: response.status },
      };
    } finally {
      clearTimeout(timer);
      caller?.removeEventListener("abort", onAbort);
    }
  }

  async #callWithEndpoint(
    method: string,
    params: unknown,
    options: RpcCallOptions & { endpoints?: EndpointSet | readonly string[] } = {},
  ): Promise<{ value: unknown; endpoint: string }> {
    const endpoints = this.#resolve(options.endpoints ?? "primary");
    const failures: RpcAttemptFailure[] = [];
    for (const endpoint of endpoints) {
      const attempt = await this.#attempt(endpoint, method, params, options);
      if (attempt.kind === "result") return { value: attempt.value, endpoint: attempt.endpoint };
      failures.push(attempt.failure);
    }
    throw new RpcUnavailableError(method, failures);
  }

  /** Low-level JSON-RPC call with ordered endpoint fallback. */
  async call<T = unknown>(
    method: string,
    params: unknown,
    options: RpcCallOptions & { endpoints?: EndpointSet | readonly string[] } = {},
  ): Promise<T> {
    return (await this.#callWithEndpoint(method, params, options)).value as T;
  }

  /** Primary endpoints first; on a listed miss or an outage, the archival endpoints. */
  async #withArchivalFallback<T>(
    missNames: readonly string[],
    run: (endpoints: readonly string[]) => Promise<T>,
  ): Promise<T> {
    try {
      return await run(this.endpoints);
    } catch (error) {
      const miss = error instanceof RpcRequestError && missNames.includes(error.type);
      if (!(miss || error instanceof RpcUnavailableError) || this.archivalEndpoints.length === 0) throw error;
      return run(this.archivalEndpoints);
    }
  }

  async #query(params: Record<string, unknown>, options: StateReadOptions): Promise<{ result: Record<string, unknown>; endpoint: string }> {
    const reference = options.blockId !== undefined ? { block_id: options.blockId } : { finality: options.finality ?? "final" };
    const { value, endpoint } = await this.#callWithEndpoint("query", { request_type: params.request_type, ...reference, ...params }, options);
    if (!isObject(value)) throw derivedError("query", endpoint, "MALFORMED_RESULT");
    return { result: value, endpoint };
  }

  /** Calls a view method and JSON-decodes its returned bytes (`null` for an empty return). */
  async viewFunction<T = unknown>(
    contractId: string,
    methodName: string,
    args: unknown = {},
    options: StateReadOptions = {},
  ): Promise<T> {
    const { result, endpoint } = await this.#query(
      {
        request_type: "call_function",
        account_id: contractId,
        method_name: methodName,
        args_base64: base64Encode(new TextEncoder().encode(JSON.stringify(args))),
      },
      options,
    );
    if (typeof result.error === "string") throw derivedError("query", endpoint, "CONTRACT_EXECUTION_ERROR", { message: result.error });
    if (!Array.isArray(result.result) || !result.result.every((b) => Number.isInteger(b) && b >= 0 && b <= 255))
      throw derivedError("query", endpoint, "MALFORMED_RESULT");
    const bytes = Uint8Array.from(result.result as number[]);
    if (bytes.length === 0) return null as T;
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
    } catch {
      throw derivedError("query", endpoint, "MALFORMED_RESULT");
    }
  }

  async viewAccount(accountId: string, options: StateReadOptions = {}): Promise<AccountView> {
    const { result, endpoint } = await this.#query({ request_type: "view_account", account_id: accountId }, options);
    if (typeof result.error === "string") throw derivedError("query", endpoint, "QUERY_ERROR");
    const { amount, locked, code_hash, storage_usage, block_height, block_hash } = result;
    if (
      typeof amount !== "string" ||
      !/^\d+$/.test(amount) ||
      typeof locked !== "string" ||
      typeof code_hash !== "string" ||
      typeof storage_usage !== "number" ||
      typeof block_height !== "number" ||
      typeof block_hash !== "string"
    )
      throw derivedError("query", endpoint, "MALFORMED_RESULT");
    return { amount, locked, codeHash: code_hash, storageUsage: storage_usage, blockHeight: block_height, blockHash: block_hash };
  }

  /** The access key's current nonce and permission, or null when the key is not on the account. */
  async viewAccessKey(accountId: string, publicKey: string, options: StateReadOptions = {}): Promise<AccessKeyView | null> {
    let answer: { result: Record<string, unknown>; endpoint: string };
    try {
      answer = await this.#query({ request_type: "view_access_key", account_id: accountId, public_key: publicKey }, options);
    } catch (error) {
      if (error instanceof RpcRequestError && error.type === "UNKNOWN_ACCESS_KEY") return null;
      throw error;
    }
    const { result, endpoint } = answer;
    if (typeof result.error === "string") {
      if (/does not exist/i.test(result.error)) return null;
      throw derivedError("query", endpoint, "QUERY_ERROR");
    }
    const permission = parsePermission(result.permission);
    if (
      !Number.isSafeInteger(result.nonce) ||
      (result.nonce as number) < 0 ||
      permission === null ||
      typeof result.block_height !== "number" ||
      typeof result.block_hash !== "string"
    )
      throw derivedError("query", endpoint, "MALFORMED_RESULT");
    return { nonce: BigInt(result.nonce as number), permission, blockHeight: result.block_height, blockHash: result.block_hash };
  }

  async viewAccessKeyList(accountId: string, options: StateReadOptions = {}): Promise<AccessKeyListEntry[]> {
    const { result, endpoint } = await this.#query({ request_type: "view_access_key_list", account_id: accountId }, options);
    if (typeof result.error === "string") throw derivedError("query", endpoint, "QUERY_ERROR");
    if (!Array.isArray(result.keys)) throw derivedError("query", endpoint, "MALFORMED_RESULT");
    return result.keys.map((entry: unknown) => {
      const key = isObject(entry) ? entry : {};
      const access = isObject(key.access_key) ? key.access_key : {};
      const permission = parsePermission(access.permission);
      if (typeof key.public_key !== "string" || !Number.isSafeInteger(access.nonce) || permission === null)
        throw derivedError("query", endpoint, "MALFORMED_RESULT");
      return { publicKey: key.public_key, nonce: BigInt(access.nonce as number), permission };
    });
  }

  /** Finality reads use primary endpoints; hash/height lookups fall back to archival on UNKNOWN_BLOCK. */
  async block(reference: BlockReference, options: RpcCallOptions & { endpoints?: EndpointSet | readonly string[] } = {}): Promise<BlockView> {
    const params = "finality" in reference ? { finality: reference.finality } : { block_id: reference.blockId };
    const fetchBlock = async (endpoints: EndpointSet | readonly string[]) => {
      const { value, endpoint } = await this.#callWithEndpoint("block", params, { ...options, endpoints });
      if (!isObject(value) || !isObject(value.header) || !Number.isSafeInteger(value.header.height) || typeof value.header.hash !== "string")
        throw derivedError("block", endpoint, "MALFORMED_RESULT");
      return value as BlockView;
    };
    if (options.endpoints !== undefined || "finality" in reference) return fetchBlock(options.endpoints ?? "primary");
    return this.#withArchivalFallback(["UNKNOWN_BLOCK"], fetchBlock);
  }

  /**
   * Transaction status by hash. `NONE` (the default) answers immediately;
   * other waits stall until the server timeout when the hash is unknown.
   * Returns null only when primary and archival endpoints both report
   * UNKNOWN_TRANSACTION; an unreachable archival endpoint is an outage, not a miss.
   */
  async txStatus(
    txHash: string,
    senderId: string,
    waitUntil: TxWaitUntil = "NONE",
    options: RpcCallOptions & { receipts?: boolean } = {},
  ): Promise<TxOutcome | null> {
    const method = options.receipts ? "EXPERIMENTAL_tx_status" : "tx";
    const timeoutMs = options.timeoutMs ?? (waitUntil === "NONE" ? this.#timeoutMs : WAITING_TIMEOUT_MS);
    const lookup = async (endpoints: readonly string[]) => {
      const { value, endpoint } = await this.#callWithEndpoint(
        method,
        { tx_hash: txHash, sender_account_id: senderId, wait_until: waitUntil },
        { ...options, timeoutMs, endpoints },
      );
      if (!isObject(value)) throw derivedError(method, endpoint, "MALFORMED_RESULT");
      return value as TxOutcome;
    };
    try {
      return await this.#withArchivalFallback(["UNKNOWN_TRANSACTION"], lookup);
    } catch (error) {
      if (error instanceof RpcRequestError && error.type === "UNKNOWN_TRANSACTION") return null;
      throw error;
    }
  }

  /**
   * For expiry decisions: on every primary and archival endpoint separately,
   * the final head height and then an immediate (`NONE`) lookup of the hash.
   * Any endpoint failure throws, so a caller never mistakes silence for absence.
   */
  async txStatusOnEachEndpoint(txHash: string, senderId: string, options: RpcCallOptions = {}): Promise<EndpointTxCheck[]> {
    const targets = [
      ...this.endpoints.map((endpoint) => ({ endpoint, archival: false })),
      ...this.archivalEndpoints.map((endpoint) => ({ endpoint, archival: true })),
    ];
    const checks: EndpointTxCheck[] = [];
    for (const target of targets) {
      const head = await this.block({ finality: "final" }, { ...options, endpoints: [target.endpoint] });
      let outcome: TxOutcome | null = null;
      try {
        const value = await this.call<unknown>(
          "tx",
          { tx_hash: txHash, sender_account_id: senderId, wait_until: "NONE" },
          { ...options, endpoints: [target.endpoint] },
        );
        if (!isObject(value)) throw derivedError("tx", target.endpoint, "MALFORMED_RESULT");
        outcome = value as TxOutcome;
      } catch (error) {
        if (!(error instanceof RpcRequestError && error.type === "UNKNOWN_TRANSACTION")) throw error;
      }
      checks.push({ endpoint: target.endpoint, archival: target.archival, headHeight: head.header.height, outcome });
    }
    return checks;
  }

  /** Broadcasts signed transaction bytes (`send_tx`). */
  async sendTransaction(signedTxBase64: string, waitUntil: TxWaitUntil = "FINAL", options: RpcCallOptions = {}): Promise<TxOutcome> {
    const timeoutMs = options.timeoutMs ?? (waitUntil === "NONE" ? this.#timeoutMs : WAITING_TIMEOUT_MS);
    const { value, endpoint } = await this.#callWithEndpoint(
      "send_tx",
      { signed_tx_base64: signedTxBase64, wait_until: waitUntil },
      { ...options, timeoutMs },
    );
    if (!isObject(value)) throw derivedError("send_tx", endpoint, "MALFORMED_RESULT");
    return value as TxOutcome;
  }

  /** Blocks after which a transaction's reference block hash is too old (testnet: 86400). */
  async transactionValidityPeriod(options: RpcCallOptions = {}): Promise<number> {
    if (this.#validityPeriod !== null) return this.#validityPeriod;
    let config: unknown;
    try {
      config = await this.call("EXPERIMENTAL_protocol_config", { finality: "final" }, options);
    } catch (error) {
      if (isAbort(error) || !(error instanceof RpcRequestError)) throw error;
      config = await this.call("EXPERIMENTAL_genesis_config", {}, options);
    }
    const period = isObject(config) ? config.transaction_validity_period : undefined;
    if (!Number.isSafeInteger(period) || (period as number) <= 0)
      throw derivedError("EXPERIMENTAL_protocol_config", "config", "MALFORMED_RESULT");
    this.#validityPeriod = period as number;
    return this.#validityPeriod;
  }
}

function parsePermission(value: unknown): AccessKeyPermissionView | null {
  if (value === "FullAccess") return "FullAccess";
  if (isObject(value) && isObject(value.FunctionCall)) {
    const call = value.FunctionCall;
    if (
      typeof call.receiver_id === "string" &&
      Array.isArray(call.method_names) &&
      call.method_names.every((name) => typeof name === "string") &&
      (call.allowance === null || typeof call.allowance === "string")
    )
      return {
        FunctionCall: { allowance: call.allowance as string | null, receiver_id: call.receiver_id, method_names: [...(call.method_names as string[])] },
      };
  }
  return null;
}
