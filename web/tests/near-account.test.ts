// App-made account rules and the testnet-helper creation flow. The helper and
// RPC are LOCAL HTTP FIXTURES on 127.0.0.1 (no account is created and no faucet
// funds are spent); response shapes follow real testnet observations.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createViaTestnetHelper,
  isAccountAvailable,
  validateNewAccountId,
  validateSubAccountId,
} from "../src/engines/near/account.ts";
import { NearRpcClient } from "../src/engines/near/rpc.ts";
import { isAccountId } from "../src/workspace/drafts.ts";
import { handlerError, ok, startFixture } from "./support/local-http-fixture.ts";
import type { FixtureReply, FixtureRequest } from "./support/local-http-fixture.ts";

test("new account IDs are single lowercase labels of 2..32 characters under .testnet", () => {
  for (const [input, accountId] of [
    ["acme-team", "acme-team.testnet"],
    ["ab", "ab.testnet"],
    ["a_b-c9", "a_b-c9.testnet"],
    ["acme.testnet", "acme.testnet"],
    ["x".repeat(32), `${"x".repeat(32)}.testnet`],
  ] as const) {
    const result = validateNewAccountId(input);
    assert.deepEqual(result, { ok: true, accountId, label: accountId.slice(0, -".testnet".length) }, input);
    assert.ok(isAccountId(accountId));
  }
  for (const input of [
    "",
    "a",
    "x".repeat(33),
    "Acme",
    "acme--team",
    "acme__team",
    "-acme",
    "acme-",
    "acme_",
    "ac me",
    "acme.team",
    "acme.team.testnet",
    "acme.near",
    "acme.testnet.testnet",
    ".testnet",
    "acmé",
    "acme-_team",
  ]) {
    assert.equal(validateNewAccountId(input).ok, false, JSON.stringify(input));
  }
});

test("sub-account IDs are one valid label directly under the parent", () => {
  assert.deepEqual(validateSubAccountId("bob.accoryn-carol.testnet", "accoryn-carol.testnet"), {
    ok: true,
    accountId: "bob.accoryn-carol.testnet",
    label: "bob",
  });
  for (const [id, parent] of [
    ["bob.x.accoryn-carol.testnet", "accoryn-carol.testnet"],
    ["accoryn-carol.testnet", "accoryn-carol.testnet"],
    ["bob.other.testnet", "accoryn-carol.testnet"],
    ["b.accoryn-carol.testnet", "accoryn-carol.testnet"],
    [`${"x".repeat(40)}.${"y".repeat(24)}.testnet`, `${"y".repeat(24)}.testnet`],
  ]) {
    assert.equal(validateSubAccountId(id, parent).ok, false, id);
  }
});

const OUR_KEY = "ed25519:BW4m9RG6hFJLRMCd4wMZfsQeM1LFa349zeWVaS8HgCSV";
const viewAccount = {
  amount: "10000000000000000000000000",
  block_hash: "DLWbBtwBXaQVb8HpEJrgCXmGGoEHDfCNGLdkHgU6iyft",
  block_height: 277517772,
  code_hash: "11111111111111111111111111111111",
  locked: "0",
  storage_paid_at: 0,
  storage_usage: 182,
};

type ChainState = { exists: boolean; keys: string[] };
function rpcFixture(state: ChainState) {
  return (r: FixtureRequest): FixtureReply => {
    const p = r.body.params;
    if (p.request_type === "view_account")
      return state.exists
        ? ok(r.body.id, viewAccount)
        : handlerError(r.body.id, "UNKNOWN_ACCOUNT", { block_height: 1, block_hash: "h", requested_account_id: p.account_id });
    if (p.request_type === "view_access_key") {
      if (state.exists && state.keys.includes(p.public_key))
        return ok(r.body.id, { block_hash: "h", block_height: 2, nonce: 277517772000000, permission: "FullAccess" });
      if (!state.exists) return handlerError(r.body.id, "UNKNOWN_ACCOUNT", { block_height: 1, block_hash: "h", requested_account_id: p.account_id });
      return ok(r.body.id, { block_hash: "h", block_height: 2, error: `access key ${p.public_key} does not exist while viewing`, logs: [] });
    }
    return { status: 400, text: "unexpected" };
  };
}

async function setup(state: ChainState, helper: (r: FixtureRequest) => FixtureReply) {
  const fixture = await startFixture((r) => (r.path === "/rpc" ? rpcFixture(state)(r) : helper(r)));
  const rpc = new NearRpcClient({ endpoints: [fixture.url("/rpc")], archivalEndpoints: [] });
  return { fixture, rpc, helperUrl: fixture.url("/account") };
}

test("isAccountAvailable maps UNKNOWN_ACCOUNT to available and an existing account to unavailable", async () => {
  const state = { exists: false, keys: [] };
  const { fixture, rpc } = await setup(state, () => ({ status: 500 }));
  try {
    assert.equal(await isAccountAvailable(rpc, "fresh-name.testnet"), true);
    state.exists = true;
    assert.equal(await isAccountAvailable(rpc, "fresh-name.testnet"), false);
  } finally {
    await fixture.close();
  }
});

test("helper creation posts the near-cli body, then confirms our key on chain", async () => {
  const state: ChainState = { exists: false, keys: [] };
  let polls = 0;
  const { fixture, rpc, helperUrl } = await setup(state, (r) => {
    // Account appears a little later, as the real helper's transaction finalizes.
    setTimeout(() => {
      state.exists = true;
      state.keys = [r.body.newAccountPublicKey];
    }, 150);
    return { json: { status: { SuccessValue: "" } } };
  });
  try {
    const result = await createViaTestnetHelper({
      accountId: "fresh-name.testnet",
      publicKey: OUR_KEY,
      rpc: { viewAccount: (...a) => rpc.viewAccount(...a), viewAccessKey: (...a) => (polls++, rpc.viewAccessKey(...a)) },
      helperUrl,
      pollIntervalMs: 50,
      confirmTimeoutMs: 5000,
    });
    assert.deepEqual(result, { status: "created", accountId: "fresh-name.testnet", publicKey: OUR_KEY, alreadyExisted: false });
    const post = fixture.requests.find((r) => r.path === "/account");
    assert.ok(post);
    assert.equal(post.method, "POST");
    assert.match(String(post.headers["content-type"]), /application\/json/);
    assert.deepEqual(post.body, { newAccountId: "fresh-name.testnet", newAccountPublicKey: OUR_KEY });
    assert.ok(polls >= 2);
  } finally {
    await fixture.close();
  }
});

test("an HTTP error after the account already holds our key is treated as created", async () => {
  const state: ChainState = { exists: false, keys: [] };
  const { fixture, rpc, helperUrl } = await setup(state, () => {
    state.exists = true;
    state.keys = [OUR_KEY];
    return { status: 500, text: "Internal Server Error" };
  });
  try {
    const result = await createViaTestnetHelper({ accountId: "fresh-name.testnet", publicKey: OUR_KEY, rpc, helperUrl, pollIntervalMs: 20, confirmTimeoutMs: 2000 });
    assert.deepEqual(result, { status: "created", accountId: "fresh-name.testnet", publicKey: OUR_KEY, alreadyExisted: false });
  } finally {
    await fixture.close();
  }
});

test("re-running creation for an account that already holds our key does not call the helper", async () => {
  const { fixture, rpc, helperUrl } = await setup({ exists: true, keys: [OUR_KEY] }, () => ({ status: 500 }));
  try {
    const result = await createViaTestnetHelper({ accountId: "fresh-name.testnet", publicKey: OUR_KEY, rpc, helperUrl });
    assert.deepEqual(result, { status: "created", accountId: "fresh-name.testnet", publicKey: OUR_KEY, alreadyExisted: true });
    assert.equal(fixture.requests.filter((r) => r.path === "/account").length, 0);
  } finally {
    await fixture.close();
  }
});

test("an account that exists with a different key is reported as taken", async () => {
  const other = "ed25519:CBc1JtdBuX1PTRE4JN2Tr2H2UcFN3MBzYfqoo4GVPbyK";
  const before = await setup({ exists: true, keys: [other] }, () => ({ status: 200, json: {} }));
  try {
    const result = await createViaTestnetHelper({ accountId: "taken-name.testnet", publicKey: OUR_KEY, rpc: before.rpc, helperUrl: before.helperUrl });
    assert.deepEqual(result, { status: "taken", accountId: "taken-name.testnet" });
    assert.equal(before.fixture.requests.filter((r) => r.path === "/account").length, 0);
  } finally {
    await before.fixture.close();
  }
  // Someone else won the race while our helper call was in flight.
  const state: ChainState = { exists: false, keys: [] };
  const race = await setup(state, () => {
    state.exists = true;
    state.keys = [other];
    return { status: 400, text: "account exists" };
  });
  try {
    const result = await createViaTestnetHelper({ accountId: "taken-name.testnet", publicKey: OUR_KEY, rpc: race.rpc, helperUrl: race.helperUrl, pollIntervalMs: 20, confirmTimeoutMs: 1000 });
    assert.deepEqual(result, { status: "taken", accountId: "taken-name.testnet" });
  } finally {
    await race.fixture.close();
  }
});

test("a helper 4xx with no account on chain is rejected; an accepted call that never confirms is unconfirmed", async () => {
  const rejected = await setup({ exists: false, keys: [] }, () => ({ status: 429, text: "Too many requests" }));
  try {
    const result = await createViaTestnetHelper({ accountId: "fresh-name.testnet", publicKey: OUR_KEY, rpc: rejected.rpc, helperUrl: rejected.helperUrl, pollIntervalMs: 20, confirmTimeoutMs: 300 });
    assert.deepEqual(result, { status: "rejected", accountId: "fresh-name.testnet", httpStatus: 429 });
  } finally {
    await rejected.fixture.close();
  }
  const silent = await setup({ exists: false, keys: [] }, () => ({ status: 200, json: {} }));
  try {
    const started = Date.now();
    const result = await createViaTestnetHelper({ accountId: "fresh-name.testnet", publicKey: OUR_KEY, rpc: silent.rpc, helperUrl: silent.helperUrl, pollIntervalMs: 20, confirmTimeoutMs: 300 });
    assert.deepEqual(result, { status: "unconfirmed", accountId: "fresh-name.testnet" });
    assert.ok(Date.now() - started < 3000);
  } finally {
    await silent.fixture.close();
  }
});

test("helper creation validates inputs before any network call and honors abort", async () => {
  const { fixture, rpc, helperUrl } = await setup({ exists: false, keys: [] }, () => ({ status: 200, json: {} }));
  try {
    await assert.rejects(createViaTestnetHelper({ accountId: "Bad Name", publicKey: OUR_KEY, rpc, helperUrl }), /account name/i);
    await assert.rejects(createViaTestnetHelper({ accountId: "fresh-name.testnet", publicKey: "ed25519:short", rpc, helperUrl }), /public key/i);
    assert.equal(fixture.requests.length, 0);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    await assert.rejects(
      createViaTestnetHelper({ accountId: "fresh-name.testnet", publicKey: OUR_KEY, rpc, helperUrl, signal: controller.signal, pollIntervalMs: 20, confirmTimeoutMs: 10_000 }),
      (error: unknown) => (error as Error).name === "AbortError",
    );
  } finally {
    await fixture.close();
  }
});
