// Public board helpers and read mapping. Deterministic RPC fixtures check the
// mapping and fail-closed parsing; they are not a live network or payout test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  describeTiers,
  parseParticipation,
  gateLockStatus,
} from "../src/engines/app/board.ts";
import { NearRpcClient } from "../src/engines/near/rpc.ts";
import {
  Keystore,
  createMemoryKeyRecordStore,
} from "../src/engines/near/keystore.ts";
import {
  TxJournal,
  createMemoryTxRecordStore,
} from "../src/engines/near/txjournal.ts";
import {
  Operations,
  memoryOperationStore,
} from "../src/engines/app/operations.ts";
import { TreasuryEngine } from "../src/engines/app/engine.ts";

const NEAR = "000000000000000000000000";
const DEFAULT_TIERS = [
  { up_to: "1" + NEAR, required: 2 },
  { up_to: "10" + NEAR, required: 3 },
];

test("tier lines mirror the gate: capped at team size, everyone above the top tier", () => {
  assert.deepEqual(describeTiers(DEFAULT_TIERS, 5), [
    "Up to 1 NEAR: 2 of 5 members",
    "Up to 10 NEAR: 3 of 5 members",
    "Above 10 NEAR: all 5 members",
  ]);
  assert.deepEqual(describeTiers(DEFAULT_TIERS, 2), [
    "Up to 1 NEAR: 2 of 2 members",
    "Up to 10 NEAR: 2 of 2 members",
    "Above 10 NEAR: all 2 members",
  ]);
  assert.deepEqual(describeTiers([], 3), ["Any amount: all 3 members"]);
});

test("tier lines refuse malformed gate data instead of guessing", () => {
  assert.throws(() => describeTiers(DEFAULT_TIERS, 0));
  assert.throws(() => describeTiers([{ up_to: "1.5", required: 2 }], 3));
  assert.throws(() => describeTiers([{ up_to: "1" + NEAR, required: 0 }], 3));
  assert.throws(() =>
    describeTiers(
      [
        { up_to: "10" + NEAR, required: 3 },
        { up_to: "1" + NEAR, required: 2 },
      ],
      3,
    ),
  );
});

test("participation parses the gate view and treats zero ceremonies as no record", () => {
  assert.deepEqual(
    parseParticipation({
      ceremonies: 2,
      last_at: "1794585149945927256",
      last_proposal_id: 4,
    }),
    { ceremonies: 2, lastAtMs: 1794585149945, lastProposalId: "4" },
  );
  assert.deepEqual(
    parseParticipation({ ceremonies: 0, last_at: "0", last_proposal_id: 0 }),
    { ceremonies: 0, lastAtMs: null, lastProposalId: null },
  );
  for (const bad of [
    null,
    {},
    { ceremonies: -1, last_at: "0", last_proposal_id: 0 },
    { ceremonies: 1, last_at: 5, last_proposal_id: 0 },
    { ceremonies: 1, last_at: "1", last_proposal_id: "0" },
  ])
    assert.throws(() => parseParticipation(bad));
});

test("gate lock status counts keys and is locked only with none", () => {
  assert.deepEqual(gateLockStatus([]), {
    locked: true,
    fullAccessKeys: 0,
    functionCallKeys: 0,
  });
  assert.deepEqual(
    gateLockStatus([
      { publicKey: "ed25519:a", nonce: 1n, permission: "FullAccess" },
      {
        publicKey: "ed25519:b",
        nonce: 1n,
        permission: {
          FunctionCall: { allowance: null, receiver_id: "x", method_names: [] },
        },
      },
    ]),
    { locked: false, fullAccessKeys: 1, functionCallKeys: 1 },
  );
});

const fixture = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")).result;
const policy = fixture("./fixtures/sputnik/get_policy.accoryn-spike.json");

function boardEngine(proposalStatus: string) {
  const tx = fixture("./fixtures/ceremony/tx_status.execute.json");
  const proposal = {
    ...fixture("./fixtures/ceremony/get_proposal.executed.json"),
    id: 1,
    status: proposalStatus,
  };
  const session = fixture("./fixtures/ceremony/get_session.voted.json");
  const rpc = new NearRpcClient({
    fetch: async (_url, init) => {
      const body = JSON.parse(init!.body as string),
        p = body.params;
      let result: unknown;
      if (body.method !== "query") result = tx;
      else if (p.request_type === "view_account")
        result = {
          amount: "10" + NEAR,
          locked: "0",
          code_hash: "AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH",
          storage_usage: 100,
          block_height: 1,
          block_hash: "11111111111111111111111111111111",
        };
      else if (p.request_type === "view_access_key_list")
        result = {
          keys: [
            {
              public_key: "ed25519:6osrwDbQxpTrREpBynRKRkr6xu3YLnocP4zMX8xUqZXM",
              access_key: { nonce: 1, permission: "FullAccess" },
            },
          ],
          block_height: 1,
          block_hash: "11111111111111111111111111111111",
        };
      else {
        const args = JSON.parse(
          Buffer.from(p.args_base64, "base64").toString(),
        );
        const value =
          p.method_name === "get_policy"
            ? policy
            : p.method_name === "get_last_proposal_id"
              ? 2
              : p.method_name === "get_proposal"
                ? { ...proposal, id: args.id }
                : p.method_name === "get_session"
                  ? args.proposal_id === 1
                    ? session
                    : null
                  : p.method_name === "required_attendees"
                    ? 2
                    : p.method_name === "get_participation"
                      ? args.account_id === "accoryn-carol.testnet"
                        ? { ceremonies: 0, last_at: "0", last_proposal_id: 0 }
                        : {
                            ceremonies: 1,
                            last_at: "1794576593895497704",
                            last_proposal_id: 1,
                          }
                      : p.method_name === "get_available_amount"
                        ? "1" + NEAR
                        : p.method_name === "get_factory_info"
                          ? { factory_id: "sputnikv2.testnet", auto_update: false }
                          : {
                              tiers: DEFAULT_TIERS,
                              window_secs: 86400,
                              version: 0,
                              custom: false,
                              window_id: "1",
                              window_spent: "0",
                            };
        result = {
          result: [...Buffer.from(JSON.stringify(value))],
          logs: [],
          block_height: 1,
          block_hash: "11111111111111111111111111111111",
        };
      }
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    },
  });
  return new TreasuryEngine({
    rpc,
    keys: new Keystore(createMemoryKeyRecordStore()),
    journal: new TxJournal(createMemoryTxRecordStore(), { locks: null }),
    operations: new Operations(memoryOperationStore()),
    authorize: async () => false,
  });
}

test("board entries name who attested in the meeting and the attendance needed", async () => {
  const entries = await boardEngine("Approved").boardEntries(
    "accoryn-spike.sputnikv2.testnet",
    new AbortController().signal,
  );
  const paid = entries.find((e) => e.row.proposalId === "1")!;
  assert.equal(paid.row.status, "settled");
  assert.deepEqual(paid.attendees, [
    "accoryn-alice.testnet",
    "accoryn-bob.testnet",
  ]);
  assert.equal(paid.required, 2);
  const noSession = entries.find((e) => e.row.proposalId === "0")!;
  assert.deepEqual(noSession.attendees, []);
});

test("a rejected proposal is exported as rejected, not as a failed payment", async () => {
  const rows = await boardEngine("Rejected").receipts(
    "accoryn-spike.sputnikv2.testnet",
    new AbortController().signal,
  );
  assert.ok(rows.length > 0);
  for (const row of rows) assert.equal(row.status, "rejected");
});

test("participation and gate keys are read from the gate for every member", async () => {
  const engine = boardEngine("Approved");
  const signal = new AbortController().signal;
  const record = await engine.participation(
    "accoryn-spike.sputnikv2.testnet",
    ["accoryn-alice.testnet", "accoryn-carol.testnet"],
    signal,
  );
  assert.deepEqual(record, [
    {
      accountId: "accoryn-alice.testnet",
      ceremonies: 1,
      lastAtMs: 1794576593895,
      lastProposalId: "1",
    },
    {
      accountId: "accoryn-carol.testnet",
      ceremonies: 0,
      lastAtMs: null,
      lastProposalId: null,
    },
  ]);
  assert.deepEqual(await engine.gateKeys(signal), {
    locked: false,
    fullAccessKeys: 1,
    functionCallKeys: 0,
  });
});
