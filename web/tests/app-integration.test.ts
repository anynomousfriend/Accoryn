import test from "node:test";
import assert from "node:assert/strict";
// Security boundary tests use deterministic chain fixtures; not physical audio.
import {
  researchGrant,
  validateResearchGrant,
} from "../src/engines/app/research-session.ts";
import {
  parseSession,
  assertSessionFor,
  membershipPolicy,
} from "../src/engines/app/protocol.ts";
import { buildGatedPolicy } from "../src/engines/near/policy.ts";
import {
  Operations,
  memoryOperationStore,
} from "../src/engines/app/operations.ts";
const fixture = {
  session_id: "1",
  dao_id: "team.sputnikv2.testnet",
  proposal_id: 0,
  host: "alice.testnet",
  session_pk: "ed25519:6osrwDbQxpTrREpBynRKRkr6xu3YLnocP4zMX8xUqZXM",
  receiver_id: "payee.testnet",
  amount: "50",
  eligible: ["alice.testnet", "bob.testnet"],
  attestations: [],
  required: 2,
  opened_at: "1000000000",
  expires_at: "4000000000",
  status: "Open",
  last_error: null,
  evidence_txs: [],
};
test("research continuation expires and cannot be used with a replaced template", () => {
  const grant = researchGrant("template", 1000);
  assert.equal(validateResearchGrant(grant, "template", 1001), true);
  assert.equal(validateResearchGrant(grant, "different", 1001), false);
  assert.equal(validateResearchGrant(grant, "template", 601000), false);
  assert.equal(
    validateResearchGrant({ ...grant, expiresAt: Infinity }, "template", 1001),
    false,
  );
});
test("session validation rejects malformed thresholds and stale or wrong intent", () => {
  const s = parseSession(fixture);
  assert.equal(s.required, 2);
  assert.throws(() => parseSession({ ...fixture, required: 0 }));
  assert.throws(() =>
    parseSession({ ...fixture, eligible: ["alice.testnet", "alice.testnet"] }),
  );
  assert.throws(() =>
    assertSessionFor(
      s,
      {
        treasuryId: fixture.dao_id,
        id: "0",
        recipient: "payee.testnet",
        amountAtomic: "51",
      },
      "alice.testnet",
      2000,
    ),
  );
  assert.throws(() =>
    assertSessionFor(
      s,
      {
        treasuryId: fixture.dao_id,
        id: "0",
        recipient: "payee.testnet",
        amountAtomic: "50",
      },
      "eve.testnet",
      2000,
    ),
  );
  assert.throws(() =>
    assertSessionFor(
      s,
      {
        treasuryId: fixture.dao_id,
        id: "0",
        recipient: "payee.testnet",
        amountAtomic: "50",
      },
      "alice.testnet",
      4000,
    ),
  );
});
test("membership replacement updates both roles atomically and preserves gated policy", () => {
  const policy = buildGatedPolicy({
    members: ["alice.testnet", "bob.testnet"],
    gateId: "gate.testnet",
  });
  const next = membershipPolicy(
    policy,
    ["alice.testnet", "carol.testnet"],
    "gate.testnet",
  );
  assert.deepEqual(next.roles.find((r) => r.name === "Admin")?.kind, {
    Group: ["alice.testnet", "carol.testnet"],
  });
  assert.deepEqual(next.roles.find((r) => r.name === "Requestor")?.kind, {
    Group: ["alice.testnet", "carol.testnet"],
  });
  assert.throws(() =>
    membershipPolicy(policy, ["alice.testnet"], "gate.testnet"),
  );
});
test("persisted operation identity survives recovery and refuses intent reuse", async () => {
  const store = memoryOperationStore();
  const ops = new Operations(store);
  const op = {
    requestId: "request-1",
    kind: "create",
    actor: "alice.testnet",
    receiver: "sputnikv2.testnet",
    args: { name: "team" },
    deposit: "6",
  };
  await ops.begin(op);
  await new Operations(store).begin(op);
  assert.deepEqual(await ops.get("request-1"), op);
  await assert.rejects(
    () => ops.begin({ ...op, args: { name: "another" } }),
    /different/,
  );
});
import { TreasuryEngine } from "../src/engines/app/engine.ts";
import {
  Keystore,
  createMemoryKeyRecordStore,
} from "../src/engines/near/keystore.ts";
import {
  TxJournal,
  createMemoryTxRecordStore,
} from "../src/engines/near/txjournal.ts";
import { NearRpcClient } from "../src/engines/near/rpc.ts";
test("real engine refuses account signing without a current research continuation", async () => {
  const engine = new TreasuryEngine({
    keys: new Keystore(createMemoryKeyRecordStore()),
    journal: new TxJournal(createMemoryTxRecordStore(), { locks: null }),
    operations: new Operations(memoryOperationStore()),
    rpc: new NearRpcClient(),
    authorize: async () => false,
  });
  await assert.rejects(
    () =>
      engine.createAccount("alice", "request", new AbortController().signal),
    /research/i,
  );
  await assert.rejects(
    () => engine.selectAccount("alice.testnet", new AbortController().signal),
    /research/i,
  );
});
import {
  planPayment,
  planTreasury,
  confirmBusinessResult,
} from "../src/engines/app/writes.ts";
test("creation plan pins the gate and deterministic treasury identity", () => {
  const a = planTreasury("request", "alice.testnet", "Team", [
    "alice.testnet",
    "bob.testnet",
  ]);
  assert.equal(a.deposit, "6000000000000000000000000");
  assert.deepEqual(
    a,
    planTreasury("request", "alice.testnet", "Team", [
      "alice.testnet",
      "bob.testnet",
    ]),
  );
  assert.throws(() =>
    planTreasury("request", "eve.testnet", "Team", [
      "alice.testnet",
      "bob.testnet",
    ]),
  );
});
test("proposal intent binds exact atomic amount and durable request tag", () => {
  const draft = {
    id: crypto.randomUUID(),
    reference: "INV-1",
    treasuryId: "team.sputnikv2.testnet",
    recipient: "payee.testnet",
    purpose: "Equipment",
    dueDate: "2026-11-20",
    lines: [{ description: "Item", quantity: 2, unitAmount: "0.025" }],
    updatedAt: new Date().toISOString(),
  };
  const op = planPayment("request", "alice.testnet", draft);
  const proposal = (op.args.input as any).proposal;
  assert.equal(proposal.kind.Transfer.amount, "50000000000000000000000");
  assert.equal(
    JSON.parse(proposal.description.split("accoryn:v1:")[1]).req,
    "request",
  );
});
test("a final void callback is rejected unless its exact business effect exists", () => {
  const op = {
    requestId: "r",
    kind: "open",
    actor: "alice.testnet",
    receiver: "gate.testnet",
    deposit: "0",
    args: {
      method: "open_session",
      input: {
        dao_id: fixture.dao_id,
        proposal_id: 0,
        session_pk: "ed25519:6osrwDbQxpTrREpBynRKRkr6xu3YLnocP4zMX8xUqZXM",
      },
    },
  };
  assert.equal(confirmBusinessResult(op, { session: null }).status, "rejected");
  assert.equal(
    confirmBusinessResult(op, { session: parseSession(fixture) }).status,
    "confirmed",
  );
  assert.equal(
    confirmBusinessResult(op, {
      session: parseSession({
        ...fixture,
        session_pk: "ed25519:11111111111111111111111111111111",
      }),
    }).status,
    "rejected",
  );
  const attest = {
    ...op,
    kind: "attest",
    expected: { sessionId: "1" },
    args: {
      method: "attest",
      input: { dao_id: fixture.dao_id, proposal_id: 0 },
    },
  };
  assert.equal(
    confirmBusinessResult(attest, { session: parseSession(fixture) }).status,
    "rejected",
  );
  assert.equal(
    confirmBusinessResult(attest, {
      session: parseSession({
        ...fixture,
        attestations: [{ account_id: "alice.testnet", at: "2000000000" }],
      }),
    }).status,
    "confirmed",
  );
  assert.equal(
    confirmBusinessResult({ ...op, kind: "execute" }, { settled: false })
      .status,
    "unknown",
  );
  assert.equal(
    confirmBusinessResult({ ...op, kind: "execute" }, { settled: true }).status,
    "confirmed",
  );
});
import { TreasuryFlow } from "../src/engines/app/writes.ts";
test("native funding reaches the signing guard without contract-call arguments", async () => {
  const flow = new TreasuryFlow({
    keys: new Keystore(createMemoryKeyRecordStore()),
    journal: new TxJournal(createMemoryTxRecordStore(), { locks: null }),
    operations: new Operations(memoryOperationStore()),
    rpc: new NearRpcClient(),
    authorize: async () => false,
  });
  await assert.rejects(
    () =>
      flow.perform(
        {
          requestId: "fund",
          kind: "fund",
          actor: "alice.testnet",
          receiver: "team.sputnikv2.testnet",
          deposit: "1",
          args: {},
        },
        new AbortController().signal,
      ),
    /research/,
  );
});
test("a final create with unavailable canonical reads stays unresolved rather than rejected", async () => {
  const flow = new TreasuryFlow({
    keys: new Keystore(createMemoryKeyRecordStore()),
    journal: new TxJournal(createMemoryTxRecordStore(), { locks: null }),
    operations: new Operations(memoryOperationStore()),
    rpc: new NearRpcClient({
      fetch: async () => {
        throw new TypeError("offline");
      },
    }),
    authorize: async () => true,
  });
  await assert.rejects(() =>
    flow.confirm(
      planTreasury("r", "alice.testnet", "Team", [
        "alice.testnet",
        "bob.testnet",
      ]),
      new AbortController().signal,
    ),
  );
});
import {
  planHardening,
  validateWriteIntent,
} from "../src/engines/app/writes.ts";
test("only testnet methods and request-tagged exact proposal intents can be resumed", () => {
  const op = planTreasury("request", "alice.testnet", "Team", [
    "alice.testnet",
    "bob.testnet",
  ]);
  assert.doesNotThrow(() => validateWriteIntent(op));
  assert.throws(() =>
    validateWriteIntent({ ...op, receiver: "sputnik-dao.near" }),
  );
  assert.throws(() =>
    validateWriteIntent({
      ...op,
      args: { ...op.args, method: "delete_account" },
    }),
  );
  assert.throws(() => validateWriteIntent({ ...op, deposit: "1" }));
});
test("factory hardening is a visible request-tagged governance proposal", () => {
  const op = planHardening(
    "request",
    "alice.testnet",
    "team.sputnikv2.testnet",
  );
  const p = (op.args.input as any).proposal;
  assert.deepEqual(p.kind, {
    FactoryInfoUpdate: {
      factory_info: { factory_id: "sputnikv2.testnet", auto_update: false },
    },
  });
  assert.equal(
    JSON.parse(p.description.split("accoryn:v1:")[1]).req,
    op.requestId,
  );
});
test("a saved intent with no signed transaction can reconcile as not submitted", async () => {
  const operations = new Operations(memoryOperationStore());
  const op = {
    requestId: "before-sign",
    kind: "fund",
    actor: "alice.testnet",
    receiver: "team.sputnikv2.testnet",
    deposit: "1",
    args: {},
  };
  await operations.begin(op);
  const flow = new TreasuryFlow({
    keys: new Keystore(createMemoryKeyRecordStore()),
    journal: new TxJournal(createMemoryTxRecordStore(), { locks: null }),
    operations,
    rpc: new NearRpcClient(),
    authorize: async () => false,
  });
  assert.equal(
    (await flow.reconcile(op.requestId, new AbortController().signal)).status,
    "rejected",
  );
});
test("malformed session keys cannot be treated as a usable acoustic identity", () => {
  assert.throws(() =>
    parseSession({ ...fixture, session_pk: "ed25519:broken" }),
  );
});
test("account retry never generates a replacement after the original local key is lost", async () => {
  const keys = new Keystore(createMemoryKeyRecordStore()),
    operations = new Operations(memoryOperationStore());
  const key = await keys.generate("alice.testnet");
  await operations.begin({
    requestId: "account-request",
    kind: "account",
    actor: "alice.testnet",
    receiver: "alice.testnet",
    deposit: "0",
    args: { accountId: "alice.testnet", publicKey: key.publicKey },
  });
  await keys.delete("alice.testnet");
  const engine = new TreasuryEngine({
    keys,
    operations,
    journal: new TxJournal(createMemoryTxRecordStore(), { locks: null }),
    rpc: new NearRpcClient(),
    authorize: async () => true,
  });
  await assert.rejects(
    () =>
      engine.createAccount(
        "alice",
        "account-request",
        new AbortController().signal,
      ),
    /original signing key/,
  );
  assert.equal(await keys.get("alice.testnet"), null);
});
import {assertCurrentMembership} from '../src/engines/app/protocol.ts';
test('a sound session cannot be used after governance changes its eligible members',()=>{
 const s=parseSession(fixture);
 assert.doesNotThrow(()=>assertCurrentMembership(s,['bob.testnet','alice.testnet']));
 assert.throws(()=>assertCurrentMembership(s,['alice.testnet','carol.testnet']),/membership changed/i);
});
test('reconciliation tombstones an unsigned intent before a delayed submit can acquire its lock',async()=>{
 const operations=new Operations(memoryOperationStore());const op={requestId:'delayed',kind:'fund',actor:'alice.testnet',receiver:'team.sputnikv2.testnet',deposit:'1',args:{}};await operations.begin(op);
 const flow=new TreasuryFlow({keys:new Keystore(createMemoryKeyRecordStore()),journal:new TxJournal(createMemoryTxRecordStore(),{locks:null}),operations,rpc:new NearRpcClient(),authorize:async()=>true});
 assert.equal((await flow.reconcile(op.requestId,new AbortController().signal)).status,'rejected');
 await assert.rejects(()=>flow.perform(op,new AbortController().signal),/cancelled before signing/);
 await assert.rejects(()=>operations.begin(op),/cancelled before signing/);
});
