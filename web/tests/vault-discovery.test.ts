// Vault and payment discovery from public testnet reads. The reader is a local
// fake that answers the same view methods with real response shapes (see
// tests/fixtures/sputnik); the live check runs against testnet separately.
import test from "node:test";
import assert from "node:assert/strict";
import {
  VAULT_NAME,
  emptyCache,
  memberVaults,
  parseCache,
  scanFactory,
  waitingPayments,
} from "../src/engines/app/discovery.ts";
import { buildGatedPolicy } from "../src/engines/near/policy.ts";

const GATE = "ceremony-gate-v1.accoryn.testnet";
type Call = { contract: string; method: string; args: unknown };
function reader(answer: (c: Call) => unknown) {
  const calls: Call[] = [];
  return {
    calls,
    async viewFunction<T>(contract: string, method: string, args: unknown = {}) {
      const c = { contract, method, args };
      calls.push(c);
      const value = answer(c);
      if (value instanceof Error) throw value;
      return value as T;
    },
  };
}

test("vault names follow the app's derived pattern", () => {
  for (const ok of [
    "phone-demo-933eb46d.sputnikv2.testnet",
    "team-a899693d.sputnikv2.testnet",
    "accoryn-demo.sputnikv2.testnet",
  ])
    assert.ok(VAULT_NAME.test(ok), ok);
  for (const no of [
    "franklindao.sputnikv2.testnet",
    "team-933eb46.sputnikv2.testnet",
    "x-933eb46d.other.testnet",
  ])
    assert.ok(!VAULT_NAME.test(no), no);
});

test("the factory scan keeps app vault names and later reads only new vaults", async () => {
  const all = [
    "genesis.sputnikv2.testnet",
    "studio-1a2b3c4d.sputnikv2.testnet",
    "other.sputnikv2.testnet",
    "accoryn-demo.sputnikv2.testnet",
    "late-0f0f0f0f.sputnikv2.testnet",
  ];
  let total = 4;
  const r = reader(({ method, args }) => {
    if (method === "get_number_daos") return total;
    const { from_index, limit } = args as { from_index: number; limit: number };
    return all.slice(from_index, Math.min(from_index + limit, total));
  });
  const first = await scanFactory(r, emptyCache());
  assert.deepEqual(first.candidates.sort(), [
    "accoryn-demo.sputnikv2.testnet",
    "studio-1a2b3c4d.sputnikv2.testnet",
  ]);
  assert.equal(first.scanned, 4);
  total = 5;
  r.calls.length = 0;
  const next = await scanFactory(r, first);
  assert.ok(next.candidates.includes("late-0f0f0f0f.sputnikv2.testnet"));
  const pages = r.calls.filter((c) => c.method === "get_daos");
  assert.deepEqual(
    pages.map((c) => (c.args as { from_index: number }).from_index),
    [4],
  );
  assert.deepEqual(parseCache(JSON.parse(JSON.stringify(next))), next);
  assert.deepEqual(parseCache({ version: 1, scanned: -1, candidates: [] }), emptyCache());
});

test("only ceremony-gated vaults that list this account are mine", async () => {
  const mine = buildGatedPolicy({ members: ["bob.testnet", "alice.testnet"], gateId: GATE });
  const notMine = buildGatedPolicy({ members: ["carol.testnet", "alice.testnet"], gateId: GATE });
  const ungated = { ...mine, roles: mine.roles.filter((role) => role.name !== "Approver") };
  const policies: Record<string, unknown> = {
    "a-11111111.sputnikv2.testnet": mine,
    "b-22222222.sputnikv2.testnet": notMine,
    "c-33333333.sputnikv2.testnet": ungated,
    "d-44444444.sputnikv2.testnet": new Error("node unavailable"),
  };
  const r = reader(({ contract }) => policies[contract]);
  const found = await memberVaults(r, "bob.testnet", Object.keys(policies), GATE);
  assert.deepEqual(found.vaults, [
    { id: "a-11111111.sputnikv2.testnet", members: ["alice.testnet", "bob.testnet"] },
  ]);
  assert.equal(found.unreadable, 1);
});

const NOW = 1_794_600_000_000;
const ns = (ms: number) => (BigInt(ms) * 1_000_000n).toString();
function transfer(id: number, status: string, submittedMs: number, kind?: unknown) {
  return {
    id,
    proposer: "alice.testnet",
    description: `Design invoice #${id}\n\naccoryn:v1:{"req":"r${id}"}`,
    kind: kind ?? {
      Transfer: { token_id: "", receiver_id: "payee.testnet", amount: "50000000000000000000000", msg: null },
    },
    status,
    vote_counts: {},
    votes: {},
    submission_time: ns(submittedMs),
  };
}
test("waiting payments are open native transfers, with any live meeting flagged", async () => {
  const dao = "a-11111111.sputnikv2.testnet";
  const policy = buildGatedPolicy({ members: ["bob.testnet", "alice.testnet"], gateId: GATE });
  const week = 7 * 86_400_000;
  const proposals = [
    transfer(0, "Approved", NOW - 1000),
    transfer(1, "InProgress", NOW - week),
    transfer(2, "InProgress", NOW - 1000, { ChangeConfig: { config: {} } }),
    transfer(3, "InProgress", NOW - 2000),
    transfer(4, "InProgress", NOW - 1000),
  ];
  const r = reader(({ contract, method, args }) => {
    if (method === "get_policy") return policy;
    if (method === "get_last_proposal_id") return proposals.length;
    if (method === "get_proposals") {
      const { from_index, limit } = args as { from_index: number; limit: number };
      return proposals.slice(from_index, from_index + limit);
    }
    if (contract === GATE && method === "get_session") {
      const { proposal_id } = args as { proposal_id: number };
      if (proposal_id !== 4) return null;
      return {
        session_id: "9", dao_id: dao, proposal_id: 4, host: "alice.testnet",
        session_pk: "ed25519:6osrwDbQxpTrREpBynRKRkr6xu3YLnocP4zMX8xUqZXM",
        receiver_id: "payee.testnet", amount: "50000000000000000000000",
        eligible: ["alice.testnet", "bob.testnet"], attestations: [{ account_id: "alice.testnet", at: ns(NOW - 30_000) }],
        required: 2, opened_at: ns(NOW - 60_000), expires_at: ns(NOW + 120_000),
        status: "Open", last_error: null, evidence_txs: [],
      };
    }
    throw new Error("unexpected " + method);
  });
  const waiting = await waitingPayments(r, dao, GATE, NOW);
  assert.deepEqual(
    waiting.map((w) => [w.proposalId, w.meetingOpen]),
    [["4", true], ["3", false]],
  );
  assert.equal(waiting[0].purpose, "Design invoice #4");
  assert.equal(waiting[0].recipient, "payee.testnet");
  assert.equal(waiting[0].amountAtomic, "50000000000000000000000");
  assert.equal(waiting[0].treasuryId, dao);
  assert.deepEqual(waiting[0].attended, ["alice.testnet"]);
});
