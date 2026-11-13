// NEAR JSON-RPC client behavior against LOCAL HTTP FIXTURES (127.0.0.1), not
// testnet. Response bodies replay shapes observed from rpc.testnet.fastnear.com,
// rpc.testnet.near.org and archival-rpc.testnet.fastnear.com on 2026-11-13.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NearRpcClient, RpcRequestError, RpcUnavailableError } from "../src/engines/near/rpc.ts";
import { handlerError, ok, startFixture } from "./support/local-http-fixture.ts";
import type { Fixture, FixtureReply, FixtureRequest } from "./support/local-http-fixture.ts";

const REFUSED = "http://127.0.0.1:1/refused";
const ACCOUNT = "accoryn-carol.testnet";
const PK = "ed25519:BW4m9RG6hFJLRMCd4wMZfsQeM1LFa349zeWVaS8HgCSV";
const HASH = "CBc1JtdBuX1PTRE4JN2Tr2H2UcFN3MBzYfqoo4GVPbyK";

async function withFixture(
  handler: (request: FixtureRequest) => FixtureReply | Promise<FixtureReply>,
  run: (fixture: Fixture) => Promise<void>,
): Promise<void> {
  const fixture = await startFixture(handler);
  try {
    await run(fixture);
  } finally {
    await fixture.close();
  }
}

const accountView = {
  amount: "9999999999999999999999999",
  block_hash: "DLWbBtwBXaQVb8HpEJrgCXmGGoEHDfCNGLdkHgU6iyft",
  block_height: 277517772,
  code_hash: "11111111111111111111111111111111",
  locked: "0",
  storage_paid_at: 0,
  storage_usage: 182,
};

test("falls back to the next endpoint after an HTTP 503 and returns its result", async () => {
  await withFixture(
    (r) => (r.path === "/a" ? { status: 503, text: "upstream unavailable" } : ok(r.body.id, accountView)),
    async (f) => {
      const rpc = new NearRpcClient({ endpoints: [f.url("/a"), f.url("/b")], archivalEndpoints: [] });
      const view = await rpc.viewAccount(ACCOUNT);
      assert.equal(view.amount, accountView.amount);
      assert.deepEqual(
        f.requests.map((r) => r.path),
        ["/a", "/b"],
      );
      assert.equal(f.requests[1].body.method, "query");
      assert.deepEqual(f.requests[1].body.params, { request_type: "view_account", finality: "final", account_id: ACCOUNT });
    },
  );
});

test("falls back after a refused connection and after a per-request timeout", async () => {
  await withFixture(
    (r) => (r.path === "/stall" ? { hang: true } : ok(r.body.id, accountView)),
    async (f) => {
      const rpc = new NearRpcClient({
        endpoints: [REFUSED, f.url("/stall"), f.url("/b")],
        archivalEndpoints: [],
        timeoutMs: 300,
      });
      const started = Date.now();
      const view = await rpc.viewAccount(ACCOUNT);
      assert.equal(view.storageUsage, 182);
      assert.ok(Date.now() - started < 5000);
      assert.deepEqual(
        f.requests.map((r) => r.path),
        ["/stall", "/b"],
      );
    },
  );
});

test("reports RpcUnavailableError with per-endpoint failure kinds when every endpoint fails", async () => {
  await withFixture(
    (r) => (r.path === "/html" ? { status: 502, text: "<html>bad gateway</html>" } : { status: 200, text: "not json" }),
    async (f) => {
      const rpc = new NearRpcClient({ endpoints: [REFUSED, f.url("/html"), f.url("/garbled")], archivalEndpoints: [] });
      await assert.rejects(rpc.viewAccount(ACCOUNT), (error: unknown) => {
        assert.ok(error instanceof RpcUnavailableError);
        assert.equal(error.method, "query");
        assert.deepEqual(
          error.failures.map((x) => x.reason),
          ["network", "http", "malformed"],
        );
        assert.equal(error.failures[1].status, 502);
        assert.doesNotMatch(error.message, /bad gateway|not json/);
        return true;
      });
    },
  );
});

test("maps a JSON-RPC handler error to RpcRequestError without trying other endpoints", async () => {
  await withFixture(
    (r) =>
      handlerError(r.body.id, "UNKNOWN_ACCOUNT", {
        block_hash: "DLWbBtwBXaQVb8HpEJrgCXmGGoEHDfCNGLdkHgU6iyft",
        block_height: 277517772,
        requested_account_id: "no-such-accoryn-zz9.testnet",
      }),
    async (f) => {
      const rpc = new NearRpcClient({ endpoints: [f.url("/a"), f.url("/b")], archivalEndpoints: [] });
      await assert.rejects(rpc.viewAccount("no-such-accoryn-zz9.testnet"), (error: unknown) => {
        assert.ok(error instanceof RpcRequestError);
        assert.equal(error.type, "UNKNOWN_ACCOUNT");
        assert.equal(error.causeName, "UNKNOWN_ACCOUNT");
        assert.equal(error.rpcName, "HANDLER_ERROR");
        assert.equal(error.method, "query");
        return true;
      });
      assert.equal(f.requests.length, 1);
    },
  );
});

test("an HTTP 408 TIMEOUT_ERROR body is a typed request error, not an outage", async () => {
  await withFixture(
    (r) => handlerError(r.body.id, "TIMEOUT_ERROR", { cause: "NOT_OBSERVED" }, 408, "Timeout"),
    async (f) => {
      const rpc = new NearRpcClient({ endpoints: [f.url("/a"), f.url("/b")], archivalEndpoints: [] });
      await assert.rejects(rpc.sendTransaction("AAAA", "FINAL"), (error: unknown) => {
        assert.ok(error instanceof RpcRequestError);
        assert.equal(error.type, "TIMEOUT_ERROR");
        assert.equal(error.httpStatus, 408);
        return true;
      });
      assert.equal(f.requests.length, 1);
      assert.deepEqual(f.requests[0].body.params, { signed_tx_base64: "AAAA", wait_until: "FINAL" });
      assert.equal(f.requests[0].body.method, "send_tx");
    },
  );
});

test("INTERNAL_ERROR responses are retried on the next endpoint", async () => {
  await withFixture(
    (r) =>
      r.path === "/a"
        ? { status: 500, json: { jsonrpc: "2.0", id: r.body.id, error: { name: "INTERNAL_ERROR", cause: { name: "INTERNAL_ERROR", info: {} }, code: -32000 } } }
        : ok(r.body.id, accountView),
    async (f) => {
      const rpc = new NearRpcClient({ endpoints: [f.url("/a"), f.url("/b")], archivalEndpoints: [] });
      assert.equal((await rpc.viewAccount(ACCOUNT)).blockHeight, 277517772);
      assert.equal(f.requests.length, 2);
    },
  );
});

test("INVALID_TRANSACTION exposes the specific InvalidTxError kind", async () => {
  const tx = { TxExecutionError: { InvalidTxError: { InvalidNonce: { ak_nonce: 10, tx_nonce: 9 } } } };
  await withFixture(
    (r) => handlerError(r.body.id, "INVALID_TRANSACTION", tx, 200, tx),
    async (f) => {
      const rpc = new NearRpcClient({ endpoints: [f.url("/a")], archivalEndpoints: [] });
      await assert.rejects(rpc.sendTransaction("AAAA", "NONE"), (error: unknown) => {
        assert.ok(error instanceof RpcRequestError);
        assert.equal(error.type, "INVALID_TRANSACTION");
        assert.equal(error.invalidTxKind, "InvalidNonce");
        return true;
      });
    },
  );
});

test("viewAccessKey returns null for both the legacy result.error and UNKNOWN_ACCESS_KEY shapes", async () => {
  await withFixture(
    (r) => {
      if (r.path === "/legacy")
        return ok(r.body.id, {
          block_hash: "FxxCxrBcHkvVrL4ASbBcwJUXt2M7KdXhTonovcshPxk6",
          block_height: 277517821,
          error: `access key ${r.body.params.public_key} does not exist while viewing`,
          logs: [],
        });
      if (r.path === "/modern") return handlerError(r.body.id, "UNKNOWN_ACCESS_KEY", { public_key: r.body.params.public_key });
      return ok(r.body.id, { block_hash: "FxxCxrBcHkvVrL4ASbBcwJUXt2M7KdXhTonovcshPxk6", block_height: 277517821, nonce: 277000000000042, permission: "FullAccess" });
    },
    async (f) => {
      const legacy = new NearRpcClient({ endpoints: [f.url("/legacy")], archivalEndpoints: [] });
      const modern = new NearRpcClient({ endpoints: [f.url("/modern")], archivalEndpoints: [] });
      const found = new NearRpcClient({ endpoints: [f.url("/found")], archivalEndpoints: [] });
      assert.equal(await legacy.viewAccessKey(ACCOUNT, PK), null);
      assert.equal(await modern.viewAccessKey(ACCOUNT, PK), null);
      const key = await found.viewAccessKey(ACCOUNT, PK, { finality: "optimistic" });
      assert.deepEqual(key, { nonce: 277000000000042n, permission: "FullAccess", blockHeight: 277517821, blockHash: "FxxCxrBcHkvVrL4ASbBcwJUXt2M7KdXhTonovcshPxk6" });
      assert.deepEqual(f.requests[2].body.params, { request_type: "view_access_key", finality: "optimistic", account_id: ACCOUNT, public_key: PK });
    },
  );
});

test("viewAccessKey refuses a nonce that JSON cannot represent exactly", async () => {
  await withFixture(
    (r) => ({ json: { jsonrpc: "2.0", id: r.body.id, result: { block_hash: "x", block_height: 1, nonce: 2 ** 60, permission: "FullAccess" } } }),
    async (f) => {
      const rpc = new NearRpcClient({ endpoints: [f.url("/a")], archivalEndpoints: [] });
      await assert.rejects(rpc.viewAccessKey(ACCOUNT, PK), (error: unknown) => error instanceof RpcRequestError && error.type === "MALFORMED_RESULT");
    },
  );
});

test("viewFunction sends base64 JSON args and decodes JSON result bytes; contract errors are typed", async () => {
  const value = { status: "Open", required: 2 };
  await withFixture(
    (r) =>
      r.path === "/err"
        ? ok(r.body.id, { block_hash: "5nKdpNgEJbAsFAuMXkbtFeiDVVHjHG9j4FkaUFKefVkS", block_height: 277517827, error: 'wasm execution failed with error: CompilationError(CodeDoesNotExist { account_id: "accoryn-carol.testnet" })', logs: [] })
        : ok(r.body.id, { block_hash: "h", block_height: 1, logs: [], result: [...new TextEncoder().encode(JSON.stringify(value))] }),
    async (f) => {
      const rpc = new NearRpcClient({ endpoints: [f.url("/a")], archivalEndpoints: [] });
      assert.deepEqual(await rpc.viewFunction("ceremony-gate-v1.accoryn.testnet", "get_session", { dao_id: "x", proposal_id: 1 }), value);
      const params = f.requests[0].body.params;
      assert.equal(params.request_type, "call_function");
      assert.equal(params.method_name, "get_session");
      assert.equal(params.finality, "final");
      assert.equal(new TextDecoder().decode(Uint8Array.from(atob(params.args_base64), (c) => c.charCodeAt(0))), '{"dao_id":"x","proposal_id":1}');
      const failing = new NearRpcClient({ endpoints: [f.url("/err")], archivalEndpoints: [] });
      await assert.rejects(failing.viewFunction(ACCOUNT, "nope"), (error: unknown) => error instanceof RpcRequestError && error.type === "CONTRACT_EXECUTION_ERROR");
    },
  );
});

test("txStatus returns null only after primary and archival both report UNKNOWN_TRANSACTION", async () => {
  const outcome = { final_execution_status: "FINAL", status: { SuccessValue: "" }, transaction: { hash: HASH, signer_id: ACCOUNT }, receipts_outcome: [] };
  await withFixture(
    (r) => {
      if (r.path === "/archive-has") return ok(r.body.id, outcome);
      return handlerError(r.body.id, "UNKNOWN_TRANSACTION", { requested_transaction_hash: r.body.params.tx_hash }, 200, `Transaction ${r.body.params.tx_hash} doesn't exist`);
    },
    async (f) => {
      const missing = new NearRpcClient({ endpoints: [f.url("/p")], archivalEndpoints: [f.url("/archive-miss")] });
      assert.equal(await missing.txStatus(HASH, ACCOUNT), null);
      assert.deepEqual(
        f.requests.map((r) => r.path),
        ["/p", "/archive-miss"],
      );
      assert.deepEqual(f.requests[0].body.params, { tx_hash: HASH, sender_account_id: ACCOUNT, wait_until: "NONE" });
      assert.equal(f.requests[0].body.method, "tx");
      const archived = new NearRpcClient({ endpoints: [f.url("/p")], archivalEndpoints: [f.url("/archive-has")] });
      assert.deepEqual(await archived.txStatus(HASH, ACCOUNT, "FINAL", { receipts: true }), outcome);
      assert.equal(f.requests[2].body.method, "EXPERIMENTAL_tx_status");
      assert.equal(f.requests[2].body.params.wait_until, "FINAL");
    },
  );
});

test("txStatus does not conclude 'unknown' when the archival endpoint is unavailable", async () => {
  await withFixture(
    (r) => handlerError(r.body.id, "UNKNOWN_TRANSACTION", { requested_transaction_hash: HASH }),
    async (f) => {
      const rpc = new NearRpcClient({ endpoints: [f.url("/p")], archivalEndpoints: [REFUSED] });
      await assert.rejects(rpc.txStatus(HASH, ACCOUNT), RpcUnavailableError);
    },
  );
});

test("block by hash falls back to archival on UNKNOWN_BLOCK; finality reads use primary", async () => {
  const header = { height: 277000000, hash: "5nKdpNgEJbAsFAuMXkbtFeiDVVHjHG9j4FkaUFKefVkS", prev_hash: "x", timestamp: 1, timestamp_nanosec: "1" };
  await withFixture(
    (r) => (r.path === "/arch" ? ok(r.body.id, { author: "v", header, chunks: [] }) : handlerError(r.body.id, "UNKNOWN_BLOCK", {}, 200, "DB Not Found Error")),
    async (f) => {
      const rpc = new NearRpcClient({ endpoints: [f.url("/p")], archivalEndpoints: [f.url("/arch")] });
      const block = await rpc.block({ blockId: header.hash });
      assert.equal(block.header.height, 277000000);
      assert.deepEqual(f.requests[0].body.params, { block_id: header.hash });
      await assert.rejects(rpc.block({ finality: "final" }), (error: unknown) => error instanceof RpcRequestError && error.type === "UNKNOWN_BLOCK");
      assert.deepEqual(f.requests.at(-1)?.body.params, { finality: "final" });
      assert.equal(f.requests.at(-1)?.path, "/p");
    },
  );
});

test("transactionValidityPeriod reads protocol config and falls back to genesis config", async () => {
  await withFixture(
    (r) => {
      if (r.path === "/proto") return ok(r.body.id, { chain_id: "testnet", transaction_validity_period: 86400 });
      if (r.body.method === "EXPERIMENTAL_protocol_config") return { json: { jsonrpc: "2.0", id: r.body.id, error: { name: "REQUEST_VALIDATION_ERROR", cause: { name: "METHOD_NOT_FOUND", info: {} }, code: -32601 } } };
      return ok(r.body.id, { chain_id: "testnet", transaction_validity_period: 86400 });
    },
    async (f) => {
      const proto = new NearRpcClient({ endpoints: [f.url("/proto")], archivalEndpoints: [] });
      assert.equal(await proto.transactionValidityPeriod(), 86400);
      assert.deepEqual(f.requests[0].body.params, { finality: "final" });
      const genesis = new NearRpcClient({ endpoints: [f.url("/old")], archivalEndpoints: [] });
      assert.equal(await genesis.transactionValidityPeriod(), 86400);
      assert.deepEqual(
        f.requests.slice(1).map((r) => r.body.method),
        ["EXPERIMENTAL_protocol_config", "EXPERIMENTAL_genesis_config"],
      );
    },
  );
});

test("txStatusOnEachEndpoint reports each endpoint's final head and lookup result", async () => {
  await withFixture(
    (r) => {
      if (r.body.method === "block") return ok(r.body.id, { header: { height: r.path === "/arch" ? 500 : 700, hash: "h" } });
      return handlerError(r.body.id, "UNKNOWN_TRANSACTION", { requested_transaction_hash: HASH });
    },
    async (f) => {
      const rpc = new NearRpcClient({ endpoints: [f.url("/p1"), f.url("/p2")], archivalEndpoints: [f.url("/arch")] });
      const checks = await rpc.txStatusOnEachEndpoint(HASH, ACCOUNT);
      assert.deepEqual(checks, [
        { endpoint: f.url("/p1"), archival: false, headHeight: 700, outcome: null },
        { endpoint: f.url("/p2"), archival: false, headHeight: 700, outcome: null },
        { endpoint: f.url("/arch"), archival: true, headHeight: 500, outcome: null },
      ]);
    },
  );
});

test("a caller abort stops immediately and never tries the next endpoint", async () => {
  await withFixture(
    () => ({ hang: true }),
    async (f) => {
      const rpc = new NearRpcClient({ endpoints: [f.url("/a"), f.url("/b")], archivalEndpoints: [], timeoutMs: 10_000 });
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);
      await assert.rejects(rpc.viewAccount(ACCOUNT, { signal: controller.signal }), (error: unknown) => (error as Error).name === "AbortError");
      assert.deepEqual(
        f.requests.map((r) => r.path),
        ["/a"],
      );
      const aborted = AbortSignal.abort();
      await assert.rejects(rpc.viewAccount(ACCOUNT, { signal: aborted }), (error: unknown) => (error as Error).name === "AbortError");
      assert.equal(f.requests.length, 1);
    },
  );
});

test("uses an injected fetch and the documented testnet endpoint defaults", async () => {
  const calls: string[] = [];
  const fakeFetch: typeof fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result: accountView }), { status: 200 });
  };
  const rpc = new NearRpcClient({ fetch: fakeFetch });
  assert.deepEqual(rpc.endpoints, ["https://rpc.testnet.fastnear.com", "https://rpc.testnet.near.org"]);
  assert.deepEqual(rpc.archivalEndpoints, ["https://archival-rpc.testnet.fastnear.com"]);
  await rpc.viewAccount(ACCOUNT);
  assert.deepEqual(calls, ["https://rpc.testnet.fastnear.com"]);
});
