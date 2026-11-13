import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  buildCreateDaoArgs,
  deriveDaoName,
  encodeDescription,
  mapProposalStatus,
  parseDescription,
  parseProposal,
  proposalContentHash,
  toAppProposal,
} from "../src/engines/near/sputnik.ts";
import type { SputnikPolicy } from "../src/engines/near/sputnik.ts";
import { validateProposal } from "../src/integration/validation.ts";
import { isAccountId } from "../src/workspace/drafts.ts";

// Real testnet responses for accoryn-spike.sputnikv2.testnet.
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/sputnik/${name}`, import.meta.url), "utf8"));
const policyFixture = read("get_policy.accoryn-spike.json") as { result: SputnikPolicy };
const proposalFixture = read("get_proposal-0.accoryn-spike.json") as {
  result: Record<string, unknown>;
};
const DAO = "accoryn-spike.sputnikv2.testnet";
const GATE = "ceremony-gate-v1.accoryn.testnet";
const MEMBERS = ["accoryn-alice.testnet", "accoryn-bob.testnet", "accoryn-carol.testnet"];
const DESCRIPTION = 'spike: 0.1 NEAR test payout\n\naccoryn:v1:{"req":"spike-1"}';
const SUBMITTED_MS = 1794574837689; // 2026-11-13T13:00:37.689Z
const EXPIRES_AT = "2026-11-16T13:00:37.689Z";
const raw = () => structuredClone(proposalFixture.result);
const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function canonical(policy: SputnikPolicy): SputnikPolicy {
  const copy = structuredClone(policy);
  for (const role of copy.roles) {
    role.permissions.sort();
    if (typeof role.kind === "object" && "Group" in role.kind) role.kind.Group.sort();
  }
  return copy;
}

test("parses the real testnet transfer proposal", () => {
  assert.deepEqual(parseProposal(proposalFixture.result), {
    id: 0,
    proposer: "accoryn-alice.testnet",
    description: DESCRIPTION,
    kind: {
      kind: "transfer",
      tokenId: "",
      receiverId: "accoryn-payee.testnet",
      amount: "100000000000000000000000",
      msg: null,
    },
    status: "InProgress",
    voteCounts: {},
    votes: {},
    submissionTimeNs: "1794574837689312111",
  });
});

test("parses vote counts as numbers or strings and keeps other kinds as labels", () => {
  const p = raw();
  p.vote_counts = { Approver: [1, 0, 0], Requestor: ["0", "2", "0"] };
  p.votes = { [GATE]: "Approve", "accoryn-bob.testnet": "Reject", "accoryn-carol.testnet": "Remove" };
  p.status = "Approved";
  p.last_actions_log = [];
  const parsed = parseProposal(p);
  assert.deepEqual(parsed.voteCounts, { Approver: ["1", "0", "0"], Requestor: ["0", "2", "0"] });
  assert.equal(parsed.votes[GATE], "Approve");

  const call = raw();
  call.kind = { FunctionCall: { receiver_id: "x.testnet", actions: [] } };
  assert.deepEqual(parseProposal(call).kind, { kind: "other", label: "call" });
  const vote = raw();
  vote.kind = "Vote";
  assert.deepEqual(parseProposal(vote).kind, { kind: "other", label: "vote" });
  const ft = raw();
  ft.kind = {
    Transfer: { token_id: "usdc.testnet", receiver_id: "a.testnet", amount: "5", msg: "hi" },
  };
  assert.deepEqual(parseProposal(ft).kind, {
    kind: "transfer",
    tokenId: "usdc.testnet",
    receiverId: "a.testnet",
    amount: "5",
    msg: "hi",
  });
});

test("rejects malformed proposals", () => {
  const variants: ((p: Record<string, unknown>) => unknown)[] = [
    () => null,
    () => "proposal",
    (p) => ({ ...p, id: -1 }),
    (p) => ({ ...p, id: "0" }),
    (p) => ({ ...p, id: 1.5 }),
    (p) => ({ ...p, proposer: "Not Valid" }),
    (p) => ({ ...p, description: 5 }),
    (p) => ({ ...p, status: "Done" }),
    (p) => ({ ...p, submission_time: 1794574837689312111 }),
    (p) => ({ ...p, submission_time: "01" }),
    (p) => ({ ...p, vote_counts: { Approver: [1, 0] } }),
    (p) => ({ ...p, vote_counts: { Approver: [-1, 0, 0] } }),
    (p) => ({ ...p, vote_counts: { Approver: ["1.0", "0", "0"] } }),
    (p) => ({ ...p, vote_counts: { Approver: [2 ** 60, 0, 0] } }),
    (p) => ({ ...p, votes: { [GATE]: "Yes" } }),
    (p) => ({ ...p, votes: { "Bad Account": "Approve" } }),
    (p) => ({ ...p, votes: [] }),
    (p) => ({ ...p, kind: { Transfer: {}, ChangeConfig: {} } }),
    (p) => ({ ...p, kind: {} }),
    (p) => ({ ...p, kind: 7 }),
    (p) => ({ ...p, kind: { Transfer: { token_id: "", receiver_id: "accoryn-payee.testnet", amount: "1.5", msg: null } } }),
    (p) => ({ ...p, kind: { Transfer: { token_id: "", receiver_id: "accoryn-payee.testnet", amount: "01", msg: null } } }),
    (p) => ({ ...p, kind: { Transfer: { token_id: "", receiver_id: "Payee", amount: "1", msg: null } } }),
    (p) => ({ ...p, kind: { Transfer: { token_id: 0, receiver_id: "accoryn-payee.testnet", amount: "1", msg: null } } }),
    (p) => ({ ...p, kind: { Transfer: { token_id: "", receiver_id: "accoryn-payee.testnet", amount: "1" } } }),
    (p) => {
      const { status: _drop, ...rest } = p;
      return rest;
    },
  ];
  for (const make of variants) {
    const input = make(raw());
    assert.throws(() => parseProposal(input), JSON.stringify(input)?.slice(0, 160));
  }
});

test("description codec round-trips purpose and tag", () => {
  assert.equal(encodeDescription("spike: 0.1 NEAR test payout", { req: "spike-1" }), DESCRIPTION);
  assert.deepEqual(parseDescription(DESCRIPTION), {
    purpose: "spike: 0.1 NEAR test payout",
    tag: { req: "spike-1" },
  });
  // Tag keys are written in a fixed order regardless of input order.
  const encoded = encodeDescription("Invoice 17", { inv: "INV-17", draft: "d-1", req: "r-1" });
  assert.equal(encoded, 'Invoice 17\n\naccoryn:v1:{"req":"r-1","draft":"d-1","inv":"INV-17"}');
  assert.deepEqual(parseDescription(encoded), {
    purpose: "Invoice 17",
    tag: { req: "r-1", draft: "d-1", inv: "INV-17" },
  });
  const long = "x".repeat(500);
  assert.deepEqual(parseDescription(encodeDescription(long, { req: "r" })).purpose, long);
});

test("description encoder enforces the draft purpose rules", () => {
  for (const purpose of ["", "   ", "x".repeat(501), "line\nbreak", "tab\there", "nul\u0000"])
    assert.throws(() => encodeDescription(purpose, { req: "r-1" }), JSON.stringify(purpose));
  for (const tag of [
    { req: "" },
    {} as { req: string },
    { req: 1 } as unknown as { req: string },
    { req: "r", draft: 2 } as unknown as { req: string },
    { req: "r", extra: "x" } as unknown as { req: string },
    { req: "r", inv: "" },
  ])
    assert.throws(() => encodeDescription("ok", tag), JSON.stringify(tag));
});

test("adversarial descriptions never yield a tag", () => {
  const untagged = (d: string) => assert.deepEqual(parseDescription(d), { purpose: d, tag: null }, d);
  untagged("Plain purpose");
  untagged("Prefix only accoryn:v1:{\"req\":\"r\"}");
  untagged('A\n\naccoryn:v1:{"req":"a"}\n\naccoryn:v1:{"req":"b"}');
  untagged('A\n\naccoryn:v1:{"req":');
  untagged('A\n\naccoryn:v1:["req"]');
  untagged('A\n\naccoryn:v1:{"req":"r","extra":1}');
  untagged('A\n\naccoryn:v1:{"req":7}');
  untagged('A\n\naccoryn:v1:{"req":""}');
  untagged('line\nbreak\n\naccoryn:v1:{"req":"r"}');
  untagged('\n\naccoryn:v1:{"req":"r"}');
  untagged('A\n\naccoryn:v1:{"req":"r"} ');
  untagged('A\n\naccoryn:v1:{"draft":"d","req":"r"}');
  untagged(`${"x".repeat(501)}\n\naccoryn:v1:{"req":"r"}`);
});

test("content hash is a stable sha256 over the canonical proposal tuple", () => {
  const input = {
    network: "testnet" as const,
    daoId: DAO,
    proposalId: "0",
    receiverId: "accoryn-payee.testnet",
    amountAtomic: "100000000000000000000000",
    description: DESCRIPTION,
  };
  const expected = sha256Hex(
    JSON.stringify([
      "accoryn-proposal-v1",
      "testnet",
      DAO,
      "0",
      "accoryn-payee.testnet",
      "100000000000000000000000",
      "native",
      DESCRIPTION,
    ]),
  );
  assert.equal(expected, "d9ff78e9bdd384d3b73a90ecd8aa425ea4cb22ddf2b16bc07ec01d7cc6401ed0");
  assert.equal(proposalContentHash(input), expected);
  assert.equal(proposalContentHash({ ...input, proposalId: 0 }), expected);
  for (const changed of [
    { ...input, daoId: "other.sputnikv2.testnet" },
    { ...input, proposalId: "1" },
    { ...input, receiverId: "mallory.testnet" },
    { ...input, amountAtomic: "100000000000000000000001" },
    { ...input, description: `${DESCRIPTION} ` },
  ])
    assert.notEqual(proposalContentHash(changed), expected);
  for (const bad of [
    { ...input, daoId: "Bad DAO" },
    { ...input, receiverId: "" },
    { ...input, amountAtomic: "1.0" },
    { ...input, proposalId: "-1" },
    { ...input, proposalId: 1.5 },
    { ...input, network: "mainnet" as "testnet" },
  ])
    assert.throws(() => proposalContentHash(bad), JSON.stringify(bad));
});

test("status mapping follows the Sputnik lifecycle", () => {
  const submissionTimeNs = "1794574837689312111";
  const proposalPeriodNs = "259200000000000";
  const expiryMs = Date.parse(EXPIRES_AT);
  const map = (status: string, nowMs: number, settlementVerified = false) =>
    mapProposalStatus({ status, submissionTimeNs, proposalPeriodNs, nowMs, settlementVerified });
  const table: [string, number, boolean, string][] = [
    ["InProgress", SUBMITTED_MS, false, "pending"],
    ["InProgress", expiryMs - 1, false, "pending"],
    ["InProgress", expiryMs + 1, false, "rejected"],
    ["Approved", SUBMITTED_MS, true, "settled"],
    ["Approved", SUBMITTED_MS, false, "unknown"],
    ["Failed", SUBMITTED_MS, false, "failed"],
    ["Rejected", SUBMITTED_MS, false, "rejected"],
    ["Expired", SUBMITTED_MS, false, "rejected"],
    ["Removed", SUBMITTED_MS, false, "rejected"],
  ];
  for (const [status, now, verified, expected] of table)
    assert.equal(map(status, now, verified), expected, `${status} @${now} verified=${verified}`);
  // Exactly at expiry the app no longer offers the proposal for approval.
  assert.equal(
    mapProposalStatus({
      status: "InProgress",
      submissionTimeNs: "1000000",
      proposalPeriodNs: "1000000",
      nowMs: 2,
      settlementVerified: false,
    }),
    "rejected",
  );
  assert.throws(() => map("Moved", SUBMITTED_MS));
  assert.throws(() => map("Done", SUBMITTED_MS));
  assert.throws(() => map("InProgress", 1.5));
  assert.throws(() =>
    mapProposalStatus({ status: "InProgress", submissionTimeNs: "x", proposalPeriodNs, nowMs: 0, settlementVerified: false }),
  );
});

test("maps the real testnet proposal to a valid app proposal", () => {
  const input = {
    daoId: DAO,
    raw: proposalFixture.result,
    policy: policyFixture.result,
    nowMs: SUBMITTED_MS + 60_000,
    attestations: ["accoryn-alice.testnet"],
    requiredAttendees: 2,
    settlementVerified: false,
  };
  const proposal = toAppProposal(input);
  const expected = {
    network: "testnet",
    asset: "native",
    id: "0",
    contentHash: "d9ff78e9bdd384d3b73a90ecd8aa425ea4cb22ddf2b16bc07ec01d7cc6401ed0",
    treasuryId: DAO,
    recipient: "accoryn-payee.testnet",
    amountAtomic: "100000000000000000000000",
    purpose: "spike: 0.1 NEAR test payout",
    status: "pending",
    approvals: ["accoryn-alice.testnet"],
    requiredApprovals: 2,
    expiresAt: EXPIRES_AT,
  };
  assert.deepEqual(proposal, expected);
  assert.deepEqual(validateProposal(proposal), expected);

  assert.equal(toAppProposal({ ...input, nowMs: Date.parse(EXPIRES_AT) + 1 }).status, "rejected");
  const approved = { ...raw(), status: "Approved" };
  assert.equal(toAppProposal({ ...input, raw: approved, settlementVerified: true }).status, "settled");
  assert.equal(toAppProposal({ ...input, raw: approved }).status, "unknown");

  const untagged = { ...raw(), description: "Paid outside the app" };
  assert.equal(toAppProposal({ ...input, raw: untagged }).purpose, "Paid outside the app");
});

test("declines proposals the app cannot represent", () => {
  const input = {
    daoId: DAO,
    policy: policyFixture.result,
    nowMs: SUBMITTED_MS,
    attestations: [] as string[],
    requiredAttendees: 2,
    settlementVerified: false,
  };
  const transfer = (overrides: Record<string, unknown>) => ({
    ...raw(),
    kind: {
      Transfer: {
        token_id: "",
        receiver_id: "accoryn-payee.testnet",
        amount: "1",
        msg: null,
        ...overrides,
      },
    },
  });
  for (const r of [
    transfer({ token_id: "usdc.testnet" }),
    transfer({ msg: "call me" }),
    transfer({ amount: "0" }),
    { ...raw(), kind: { FunctionCall: { receiver_id: "x.testnet", actions: [] } } },
    { ...raw(), status: "Moved" },
    { ...raw(), description: "x".repeat(501) },
    { ...raw(), description: "" },
  ])
    assert.throws(() => toAppProposal({ ...input, raw: r }), JSON.stringify(r).slice(0, 160));
  assert.throws(() => toAppProposal({ ...input, raw: raw(), daoId: "Bad DAO" }));
  assert.throws(() => toAppProposal({ ...input, raw: raw(), attestations: ["a.testnet", "a.testnet"] }));
  assert.throws(() => toAppProposal({ ...input, raw: raw(), requiredAttendees: 0 }));
  assert.throws(() =>
    toAppProposal({ ...input, raw: raw(), policy: { ...policyFixture.result, proposal_period: "soon" } }),
  );
});

test("DAO names are deterministic, valid factory sub-accounts", () => {
  const suffix = sha256Hex("req-1").slice(0, 8);
  assert.equal(deriveDaoName("Acme Ops Team", "req-1"), `acme-ops-team-${suffix}`);
  assert.equal(deriveDaoName("Acme Ops Team", "req-1"), deriveDaoName("Acme Ops Team", "req-1"));
  assert.notEqual(deriveDaoName("Acme Ops Team", "req-1"), deriveDaoName("Acme Ops Team", "req-2"));
  assert.equal(deriveDaoName("  !!!  ", "req-1"), `team-${suffix}`);
  assert.equal(deriveDaoName("", "req-1"), `team-${suffix}`);
  assert.equal(deriveDaoName("Café — Ünïcode__Crew", "req-1"), `cafe-unicode-crew-${suffix}`);
  assert.equal(deriveDaoName("abcdefghijklmnopqrs tuvwxyz", "req-1"), `abcdefghijklmnopqrs-${suffix}`);
  for (const team of ["A", "x".repeat(200), "--a--b--", "日本語チーム", "a.b.c", "UPPER_lower 123"]) {
    const name = deriveDaoName(team, "550e8400-e29b-41d4-a716-446655440000");
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/, team);
    assert.ok(name.length <= 29, name);
    const accountId = `${name}.sputnikv2.testnet`;
    assert.ok(isAccountId(accountId) && accountId.length <= 64, accountId);
  }
  assert.throws(() => deriveDaoName("Team", ""));
});

test("create-DAO args decode to the policy testnet stored", () => {
  const name = deriveDaoName("Accoryn Spike", "req-1");
  const out = buildCreateDaoArgs({ name, purpose: "Café ☕ budget", members: MEMBERS, gateId: GATE });
  assert.equal(out.name, name);
  const decoded = JSON.parse(Buffer.from(out.args, "base64").toString("utf8"));
  assert.deepEqual(Object.keys(decoded).sort(), ["config", "policy"]);
  assert.deepEqual(decoded.config, { name, purpose: "Café ☕ budget", metadata: "" });
  assert.deepEqual(canonical(decoded.policy), canonical(policyFixture.result));
  assert.equal(Buffer.from(out.args, "base64").toString("base64"), out.args);

  for (const bad of [
    { name: "Bad", purpose: "", members: MEMBERS, gateId: GATE },
    { name: "a.b", purpose: "", members: MEMBERS, gateId: GATE },
    { name: "-team", purpose: "", members: MEMBERS, gateId: GATE },
    { name: "x".repeat(47), purpose: "", members: MEMBERS, gateId: GATE },
    { name, purpose: "line\nbreak", members: MEMBERS, gateId: GATE },
    { name, purpose: "", members: [MEMBERS[0]], gateId: GATE },
    { name, purpose: "", members: [...MEMBERS, GATE], gateId: GATE },
  ])
    assert.throws(() => buildCreateDaoArgs(bad), JSON.stringify(bad).slice(0, 120));
});
