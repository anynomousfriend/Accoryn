// Deterministic RPC fixture tests. These check app mapping and fail-closed
// behavior, not network availability, physical media or a new payout.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
import { TreasuryEngine, GATE_HASH } from "../src/engines/app/engine.ts";
const fixture = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")).result;
const policy = fixture("./fixtures/sputnik/get_policy.accoryn-spike.json");
function engineWith(
  policyResponse: unknown = policy,
  hash = GATE_HASH,
  daoHash = "AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH",
) {
  const rpc = new NearRpcClient({
    fetch: async (_url, init) => {
      const body = JSON.parse(init!.body as string),
        p = body.params;
      let result: unknown;
      if (p.request_type === "view_account")
        result = {
          amount: "10000000000000000000000000",
          locked: "0",
          code_hash:
            p.account_id === "ceremony-gate-v1.accoryn.testnet"
              ? hash
              : daoHash,
          storage_usage: 100,
          block_height: 1,
          block_hash: "11111111111111111111111111111111",
        };
      else {
        const value =
          p.method_name === "get_policy"
            ? policyResponse
            : p.method_name === "get_available_amount"
              ? "1000000000000000000000000"
              : p.method_name === "get_factory_info"
                ? { factory_id: "sputnikv2.testnet", auto_update: true }
                : {
                    tiers: [
                      { up_to: "1000000000000000000000000", required: 2 },
                    ],
                    window_secs: 3600,
                    version: 1,
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
    authorize: async () => true,
  });
}
test("real read adapter maps recorded policy, spendable balance and separate governance threshold", async () => {
  const t = await engineWith().treasury(
    "accoryn-spike.sputnikv2.testnet",
    new AbortController().signal,
  );
  assert.equal(t.members.length, 3);
  assert.equal(t.governanceApprovals, 2);
  assert.equal(t.spendableAtomic, "1000000000000000000000000");
  assert.equal(t.tiers.version, 1);
});
test("ungated policy and changed gate hash fail visibly", async () => {
  const changed = structuredClone(policy);
  changed.roles.find((r: any) => r.name === "Approver").kind.Group = [
    "intruder.testnet",
  ];
  await assert.rejects(
    () =>
      engineWith(changed).treasury(
        "accoryn-spike.sputnikv2.testnet",
        new AbortController().signal,
      ),
    /not ceremony-gated/,
  );
  await assert.rejects(
    () => engineWith(policy, "changed").pinGate(new AbortController().signal),
    /code hash changed/,
  );
});
test("an arbitrary existing account cannot be selected without a local signing key", async () => {
  await assert.rejects(
    () =>
      engineWith().selectAccount(
        "someone.testnet",
        new AbortController().signal,
      ),
    /No signing key/,
  );
});

test("a treasury code change cannot masquerade as the supported Sputnik contract", async () => {
  await assert.rejects(
    () =>
      engineWith(policy, GATE_HASH, "changed").treasury(
        "accoryn-spike.sputnikv2.testnet",
        new AbortController().signal,
      ),
    /treasury code hash/i,
  );
});
import { TreasuryFlow } from "../src/engines/app/writes.ts";
function recordedPaymentEngine(id: number, status = "Approved", sessionStatus="Voted") {
  const tx = fixture("./fixtures/ceremony/tx_status.execute.json");
  const proposal = {
    ...fixture("./fixtures/ceremony/get_proposal.executed.json"),
    id,
    status,
  };
  const session = {
    ...fixture("./fixtures/ceremony/get_session.voted.json"),
    proposal_id: id,
    status:sessionStatus,
  };
  const rpc = new NearRpcClient({
    fetch: async (_url, init) => {
      const body = JSON.parse(init!.body as string),
        p = body.params;
      let result: unknown;
      if (body.method !== "query") result = tx;
      else if (p.request_type === "view_account")
        result = {
          amount: "10000000000000000000000000",
          locked: "0",
          code_hash: "AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH",
          storage_usage: 100,
          block_height: 1,
          block_hash: "11111111111111111111111111111111",
        };
      else {
        const value =
          p.method_name === "get_policy"
            ? policy
            : p.method_name === "get_proposal"
              ? proposal
              : p.method_name === "get_session"
                ? session
                : p.method_name === "required_attendees"
                  ? 2
                  : p.method_name === "get_available_amount"
                    ? "1000000000000000000000000"
                    : p.method_name === "get_factory_info"
                      ? { factory_id: "sputnikv2.testnet", auto_update: true }
                      : {
                          tiers: [
                            { up_to: "1000000000000000000000000", required: 2 },
                          ],
                          window_secs: 3600,
                          version: 1,
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
  return new TreasuryFlow({
    rpc,
    keys: new Keystore(createMemoryKeyRecordStore()),
    journal: new TxJournal(createMemoryTxRecordStore(), { locks: null }),
    operations: new Operations(memoryOperationStore()),
    authorize: async () => false,
  });
}
test("recorded proposal 1 payout verifies, but cannot settle proposal 2 with equal recipient and amount", async () => {
  assert.equal(
    (
      await recordedPaymentEngine(1).payment(
        "accoryn-spike.sputnikv2.testnet",
        "1",
        new AbortController().signal,
      )
    ).proposal.status,
    "settled",
  );
  const wrong = await recordedPaymentEngine(2).payment(
    "accoryn-spike.sputnikv2.testnet",
    "2",
    new AbortController().signal,
  );
  assert.equal(wrong.proposal.status, "unknown");
  assert.deepEqual(wrong.transactionIds, []);
});
test("canonical failed payout is definitive, retaining its proposal and never silently retrying", async () => {
  const engine = recordedPaymentEngine(1, "Failed");
  const result = await engine.confirm(
    {
      requestId: "failed-execute",
      kind: "execute:accoryn-spike.sputnikv2.testnet:1",
      actor: "accoryn-carol.testnet",
      receiver: "ceremony-gate-v1.accoryn.testnet",
      args: {
        method: "execute",
        input: { dao_id: "accoryn-spike.sputnikv2.testnet", proposal_id: 1 },
      },
      deposit: "0",
    },
    new AbortController().signal,
  );
  assert.equal(result.status, "rejected");
  assert.equal(result.proposalId, "1");
  assert.match(result.message ?? "", /failed/i);
});
test("funding rechecks the target treasury code instead of relying on an earlier UI read", async () => {
  const base = engineWith(policy, GATE_HASH, "changed");
  const flow = new TreasuryFlow(base.deps);
  flow.accountId = "alice.testnet";
  await assert.rejects(
    () =>
      flow.perform(
        {
          requestId: "fund-changed",
          kind: "fund",
          actor: "alice.testnet",
          receiver: "accoryn-spike.sputnikv2.testnet",
          args: {},
          deposit: "1",
        },
        new AbortController().signal,
      ),
    /treasury code hash/i,
  );
});

test('a terminal failed proposal remains definitive even if the session execution flag is stale',async()=>{
 const engine=recordedPaymentEngine(1,'Failed','Executing');
 const result=await engine.confirm({requestId:'failed-stale',kind:'execute:accoryn-spike.sputnikv2.testnet:1',actor:'accoryn-carol.testnet',receiver:'ceremony-gate-v1.accoryn.testnet',args:{method:'execute',input:{dao_id:'accoryn-spike.sputnikv2.testnet',proposal_id:1}},deposit:'0'},new AbortController().signal);
 assert.equal(result.status,'rejected');
});
