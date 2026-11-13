// IN-MEMORY CHAIN DOUBLE for transaction-journal state-machine tests.
//
// It implements only the RPC subset the journal calls, and models the rules the
// journal depends on (strictly increasing access-key nonces, identical bytes have
// one hash, a validity window counted in blocks). It is not a NEAR node and is
// not evidence of testnet behavior; tests/near-live-testnet.test.ts covers that.
import { baseEncode, decodeSignedTransaction, base64Decode } from "near-api-js";
import { sha256 } from "@noble/hashes/sha2.js";
import { RpcRequestError, RpcUnavailableError } from "../../src/engines/near/rpc.ts";
import type { AccessKeyView, BlockView, TxOutcome, TxWaitUntil, EndpointTxCheck } from "../../src/engines/near/rpc.ts";

export type SendMode =
  | "execute" // validate, execute and return a FINAL outcome
  | "fail" // validate, execute with an ActionError Failure
  | "accept-timeout" // validate, put in pool, reply TIMEOUT_ERROR
  | "lost" // transport failure before the node saw it
  | "accepted-then-lost" // node executes it, but the reply is lost
  | "pool" // validate, accept into pool, reply NONE
  | "wrong-hash"; // execute but report another hash (corrupted relay)

const rpcError = (method: string, causeName: string, info: unknown = {}) =>
  new RpcRequestError({
    method,
    endpoint: "chain-double",
    httpStatus: 200,
    error: { name: "HANDLER_ERROR", cause: { name: causeName, info }, code: -32000, message: "Server error", data: info },
  });

export class ChainDouble {
  head = 1000;
  validityPeriod = 100;
  blocks = new Map<string, number>();
  /** Access-key nonce history per `account|publicKey`, oldest first. */
  keys = new Map<string, Array<{ height: number; nonce: bigint }>>();
  executed = new Map<string, TxOutcome>();
  pool = new Map<string, string>();
  sendMode: SendMode = "execute";
  lookupsUnavailable = false;
  /** Final heads reported per endpoint by txStatusOnEachEndpoint (primary, archival). */
  endpointLag = [0, 0];
  withArchival = true;
  sent: string[] = [];
  beforeSend: ((signedTxBase64: string) => void | Promise<void>) | null = null;

  constructor() {
    this.newBlock();
  }

  newBlock(): string {
    this.head += 1;
    const hash = baseEncode(sha256(new TextEncoder().encode(`block-${this.head}`)));
    this.blocks.set(hash, this.head);
    return hash;
  }

  advance(blocks: number): void {
    for (let i = 0; i < blocks; i++) this.newBlock();
  }

  latestHash(): string {
    for (const [hash, height] of this.blocks) if (height === this.head) return hash;
    throw new Error("no head");
  }

  private setNonce(accountId: string, publicKey: string, nonce: bigint): void {
    const key = `${accountId}|${publicKey}`;
    this.keys.set(key, [...(this.keys.get(key) ?? []), { height: this.head, nonce }]);
  }

  addKey(accountId: string, publicKey: string, nonce: bigint): void {
    this.setNonce(accountId, publicKey, nonce);
  }

  nonceOf(accountId: string, publicKey: string, atHeight = this.head): bigint | undefined {
    const history = (this.keys.get(`${accountId}|${publicKey}`) ?? []).filter((entry) => entry.height <= atHeight);
    return history.at(-1)?.nonce;
  }

  /** Another client consumes nonces on the same key (e.g., a second device). */
  consumeNonce(accountId: string, publicKey: string, nonce: bigint): void {
    this.newBlock();
    this.setNonce(accountId, publicKey, nonce);
  }

  executePool(failure = false): void {
    for (const [hash, b64] of [...this.pool]) {
      this.pool.delete(hash);
      this.execute(b64, failure);
    }
  }

  private execute(b64: string, failure: boolean, reportHash?: string): TxOutcome {
    const signed = decodeSignedTransaction(base64Decode(b64));
    const tx = signed.transaction;
    const hash = baseEncode(sha256(tx.encode()));
    this.newBlock();
    this.setNonce(tx.signerId, tx.publicKey.toString(), tx.nonce);
    const outcome: TxOutcome = {
      final_execution_status: "FINAL",
      status: failure ? { Failure: { ActionError: { index: 0, kind: { AccountDoesNotExist: { account_id: tx.receiverId } } } } } : { SuccessValue: "" },
      transaction: { hash: reportHash ?? hash, signer_id: tx.signerId, receiver_id: tx.receiverId, nonce: Number(tx.nonce) },
      transaction_outcome: { id: hash },
      receipts_outcome: [],
    };
    this.executed.set(hash, outcome);
    return outcome;
  }

  private validate(b64: string): string {
    const signed = decodeSignedTransaction(base64Decode(b64));
    const tx = signed.transaction;
    const hash = baseEncode(sha256(tx.encode()));
    if (!tx.publicKey.verify(sha256(tx.encode()), signed.signature.data)) throw rpcError("send_tx", "INVALID_TRANSACTION", { InvalidTxError: "InvalidSignature" });
    const akNonce = this.nonceOf(tx.signerId, tx.publicKey.toString());
    if (akNonce === undefined) throw rpcError("send_tx", "INVALID_TRANSACTION", { InvalidTxError: { InvalidAccessKeyError: { AccessKeyNotFound: {} } } });
    if (tx.nonce <= akNonce) throw rpcError("send_tx", "INVALID_TRANSACTION", { InvalidTxError: { InvalidNonce: { ak_nonce: Number(akNonce), tx_nonce: Number(tx.nonce) } } });
    const height = this.blocks.get(baseEncode(Uint8Array.from(tx.blockHash)));
    if (height === undefined) throw rpcError("send_tx", "INVALID_TRANSACTION", { InvalidTxError: "InvalidChain" });
    if (this.head - height > this.validityPeriod) throw rpcError("send_tx", "INVALID_TRANSACTION", { InvalidTxError: "Expired" });
    return hash;
  }

  // ---- RPC subset used by the journal -------------------------------------
  viewAccessKey = async (
    accountId: string,
    publicKey: string,
    options: { blockId?: number | string } = {},
  ): Promise<AccessKeyView | null> => {
    if (this.lookupsUnavailable) throw new RpcUnavailableError("query", [{ endpoint: "chain-double", reason: "network" }]);
    const height = typeof options.blockId === "number" ? options.blockId : this.head;
    const nonce = this.nonceOf(accountId, publicKey, height);
    const blockHash = [...this.blocks].find(([, h]) => h === height)?.[0] ?? this.latestHash();
    return nonce === undefined ? null : { nonce, permission: "FullAccess", blockHeight: height, blockHash };
  };

  block = async (reference: { finality: string } | { blockId: string | number }): Promise<BlockView> => {
    if (this.lookupsUnavailable) throw new RpcUnavailableError("block", [{ endpoint: "chain-double", reason: "network" }]);
    if ("finality" in reference) return { header: { height: this.head, hash: this.latestHash() } };
    for (const [hash, height] of this.blocks)
      if (hash === reference.blockId || height === reference.blockId) return { header: { height, hash } };
    throw rpcError("block", "UNKNOWN_BLOCK");
  };

  transactionValidityPeriod = async (): Promise<number> => this.validityPeriod;

  txStatus = async (txHash: string, _senderId: string, _waitUntil?: TxWaitUntil): Promise<TxOutcome | null> => {
    if (this.lookupsUnavailable) throw new RpcUnavailableError("tx", [{ endpoint: "chain-double", reason: "timeout" }]);
    return this.executed.get(txHash) ?? null;
  };

  txStatusOnEachEndpoint = async (txHash: string, _senderId: string): Promise<EndpointTxCheck[]> => {
    if (this.lookupsUnavailable) throw new RpcUnavailableError("tx", [{ endpoint: "chain-double", reason: "timeout" }]);
    const outcome = this.executed.get(txHash) ?? null;
    const checks: EndpointTxCheck[] = [{ endpoint: "primary", archival: false, headHeight: this.head - this.endpointLag[0], outcome }];
    if (this.withArchival) checks.push({ endpoint: "archival", archival: true, headHeight: this.head - this.endpointLag[1], outcome });
    return checks;
  };

  sendTransaction = async (signedTxBase64: string, waitUntil: TxWaitUntil = "FINAL"): Promise<TxOutcome> => {
    this.sent.push(signedTxBase64);
    if (this.beforeSend) await this.beforeSend(signedTxBase64);
    const signed = decodeSignedTransaction(base64Decode(signedTxBase64));
    const hash = baseEncode(sha256(signed.transaction.encode()));
    const known = this.executed.get(hash);
    if (known) return known;
    if (waitUntil === "NONE" && this.sendMode !== "lost") {
      // Observed on testnet 2026-11-13: wait_until NONE answers
      // {"final_execution_status":"NONE"} without validating, even for a
      // consumed nonce. Valid bytes still enter the pool.
      try {
        this.validate(signedTxBase64);
        this.pool.set(hash, signedTxBase64);
      } catch {
        // silently dropped, exactly like the real endpoint
      }
      return { final_execution_status: "NONE" };
    }
    switch (this.sendMode) {
      case "lost":
        throw new RpcUnavailableError("send_tx", [{ endpoint: "chain-double", reason: "network" }]);
      case "accepted-then-lost":
        this.validate(signedTxBase64);
        this.execute(signedTxBase64, false);
        throw new RpcUnavailableError("send_tx", [{ endpoint: "chain-double", reason: "timeout" }]);
      case "accept-timeout":
        this.validate(signedTxBase64);
        this.pool.set(hash, signedTxBase64);
        throw rpcError("send_tx", "TIMEOUT_ERROR", { cause: "NOT_OBSERVED" });
      case "pool":
        this.validate(signedTxBase64);
        this.pool.set(hash, signedTxBase64);
        return { final_execution_status: "NONE" };
      case "fail":
        this.validate(signedTxBase64);
        return this.execute(signedTxBase64, true);
      case "wrong-hash":
        this.validate(signedTxBase64);
        return this.execute(signedTxBase64, false, "11111111111111111111111111111111");
      default:
        this.validate(signedTxBase64);
        return this.execute(signedTxBase64, false);
    }
  };
}
