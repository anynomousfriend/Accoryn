import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildGatedPolicy,
  checkPolicyConformance,
  governanceThreshold,
} from "../src/engines/near/policy.ts";
import type { SputnikPolicy, SputnikRole } from "../src/engines/near/sputnik.ts";

// Real testnet get_policy response for accoryn-spike.sputnikv2.testnet.
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/sputnik/get_policy.accoryn-spike.json", import.meta.url),
    "utf8",
  ),
) as { result: SputnikPolicy };
const GATE = "ceremony-gate-v1.accoryn.testnet";
const MEMBERS = [
  "accoryn-alice.testnet",
  "accoryn-bob.testnet",
  "accoryn-carol.testnet",
];
const MALLORY = "mallory.testnet";

// Sputnik stores role permissions and Group members as sets, so the order
// read back from the chain is not the order that was sent.
function canonical(policy: SputnikPolicy): SputnikPolicy {
  const copy = structuredClone(policy);
  for (const role of copy.roles) {
    role.permissions.sort();
    if (typeof role.kind === "object" && "Group" in role.kind)
      role.kind.Group.sort();
  }
  return copy;
}
const onChain = () => structuredClone(fixture.result);
const role = (policy: SputnikPolicy, name: string): SputnikRole => {
  const found = policy.roles.find((r) => r.name === name);
  assert.ok(found, `role ${name}`);
  return found;
};
const group = (r: SputnikRole): string[] => {
  assert.ok(typeof r.kind === "object" && "Group" in r.kind);
  return r.kind.Group;
};
function rejected(policy: unknown, gateId = GATE): string[] {
  const result = checkPolicyConformance(policy, { gateId });
  assert.equal(result.ok, false, "policy must be rejected");
  return result.ok ? [] : result.reasons;
}
function assertRejects(policy: unknown, code: string) {
  const reasons = rejected(policy);
  assert.ok(reasons.includes(code), `expected ${code} in ${JSON.stringify(reasons)}`);
}
const accounts = (n: number) =>
  Array.from({ length: n }, (_, i) => `member-${i + 1}.testnet`);

test("governance threshold is max(2, N-1)", () => {
  assert.deepEqual(
    [2, 3, 4, 5, 16].map(governanceThreshold),
    [2, 2, 3, 4, 15],
  );
  for (const bad of [0, -1, 2.5, Number.NaN]) assert.throws(() => governanceThreshold(bad));
});

test("builder reproduces the policy testnet stored for the spike DAO", () => {
  const built = buildGatedPolicy({ members: MEMBERS, gateId: GATE });
  assert.notDeepEqual(built, fixture.result, "on-chain permission order differs from sent order");
  assert.deepEqual(canonical(built), canonical(fixture.result));
});

test("builder applies a custom proposal period and keeps every other field", () => {
  const built = buildGatedPolicy({
    members: MEMBERS,
    gateId: GATE,
    proposalPeriodNs: "3600000000000",
  });
  assert.equal(built.proposal_period, "3600000000000");
  assert.deepEqual(canonical({ ...built, proposal_period: "259200000000000" }), canonical(fixture.result));
});

test("builder sets governance threshold from team size", () => {
  for (let n = 2; n <= 16; n++) {
    const built = buildGatedPolicy({ members: accounts(n), gateId: GATE });
    assert.deepEqual(built.default_vote_policy, {
      weight_kind: "RoleWeight",
      quorum: "2",
      threshold: String(Math.max(2, n - 1)),
    });
  }
});

test("builder refuses unsafe or invalid team definitions", () => {
  const bad: Parameters<typeof buildGatedPolicy>[0][] = [
    { members: ["accoryn-alice.testnet"], gateId: GATE },
    { members: accounts(17), gateId: GATE },
    { members: [], gateId: GATE },
    { members: ["accoryn-alice.testnet", "accoryn-alice.testnet"], gateId: GATE },
    { members: ["accoryn-alice.testnet", "Bob.testnet"], gateId: GATE },
    { members: ["accoryn-alice.testnet", GATE], gateId: GATE },
    { members: MEMBERS, gateId: "not a gate" },
    { members: MEMBERS, gateId: GATE, proposalPeriodNs: "0" },
    { members: MEMBERS, gateId: GATE, proposalPeriodNs: "01" },
    { members: MEMBERS, gateId: GATE, proposalPeriodNs: "1.5" },
    { members: MEMBERS, gateId: GATE, proposalPeriodNs: "18446744073709551616" },
  ];
  for (const input of bad) assert.throws(() => buildGatedPolicy(input), JSON.stringify(input));
});

test("conformance accepts the real testnet policy", () => {
  assert.deepEqual(checkPolicyConformance(fixture.result, { gateId: GATE }), {
    ok: true,
    members: [...MEMBERS].sort(),
    governanceApprovals: 2,
  });
});

test("conformance is independent of permission and member order", () => {
  const p = onChain();
  for (const r of p.roles) {
    r.permissions.reverse();
    if (typeof r.kind === "object" && "Group" in r.kind) r.kind.Group.reverse();
  }
  p.roles.reverse();
  assert.equal(checkPolicyConformance(p, { gateId: GATE }).ok, true);
});

test("conformance accepts every built team size", () => {
  for (let n = 2; n <= 16; n++) {
    const members = accounts(n);
    assert.deepEqual(
      checkPolicyConformance(buildGatedPolicy({ members, gateId: GATE }), { gateId: GATE }),
      { ok: true, members: [...members].sort(), governanceApprovals: Math.max(2, n - 1) },
    );
  }
});

test("a human role holding any transfer approval is rejected", () => {
  for (const [roleName, perm, wildcard] of [
    ["Requestor", "transfer:VoteApprove", false],
    ["Requestor", "*:*", true],
    ["Requestor", "transfer:*", true],
    ["Admin", "*:VoteApprove", true],
    ["Admin", "transfer:VoteApprove", false],
  ] as const) {
    const p = onChain();
    role(p, roleName).permissions.push(perm);
    const reasons = rejected(p);
    assert.ok(reasons.includes("HUMAN_CAN_APPROVE_TRANSFER"), `${roleName} ${perm}: ${reasons}`);
    assert.equal(reasons.includes(`WILDCARD_PERMISSION:${perm}`), wildcard, `${perm}: ${reasons}`);
  }
});

test("wildcards are rejected even on the gate role", () => {
  const p = onChain();
  role(p, "Approver").permissions = ["transfer:*"];
  assertRejects(p, "WILDCARD_PERMISSION:transfer:*");
});

test("Everyone and Member role kinds are rejected", () => {
  const everyone = onChain();
  everyone.roles.push({
    name: "all",
    kind: "Everyone",
    permissions: ["transfer:AddProposal"],
    vote_policy: {},
  });
  assertRejects(everyone, "ROLE_EVERYONE");
  assertRejects(everyone, "ROLE_UNEXPECTED:all");

  const member = onChain();
  role(member, "Requestor").kind = { Member: "1" };
  assertRejects(member, "ROLE_MEMBER_KIND");
});

test("the approver role must contain only the gate", () => {
  const extra = onChain();
  group(role(extra, "Approver")).push("accoryn-alice.testnet");
  assertRejects(extra, "APPROVER_NOT_GATE_ONLY");

  const outsider = onChain();
  group(role(outsider, "Approver")).push(MALLORY);
  assertRejects(outsider, "APPROVER_NOT_GATE_ONLY");

  const replaced = onChain();
  role(replaced, "Approver").kind = { Group: [MALLORY] };
  assertRejects(replaced, "HUMAN_CAN_APPROVE_TRANSFER");
  assertRejects(replaced, "APPROVER_MISSING");

  // The same on-chain policy does not conform for a different gate.
  const reasons = rejected(onChain(), "other-gate.testnet");
  assert.ok(reasons.includes("APPROVER_MISSING"), String(reasons));
  assert.ok(reasons.includes("HUMAN_CAN_APPROVE_TRANSFER"), String(reasons));
});

test("the approver role must use a single-vote, zero-quorum role-weight transfer policy", () => {
  const variants: [string, unknown][] = [
    ["threshold zero", { weight_kind: "RoleWeight", quorum: "0", threshold: "0" }],
    ["ratio threshold", { weight_kind: "RoleWeight", quorum: "0", threshold: [1, 2] }],
    ["quorum two", { weight_kind: "RoleWeight", quorum: "2", threshold: "1" }],
    ["quorum one", { weight_kind: "RoleWeight", quorum: "1", threshold: "1" }],
    ["token weight", { weight_kind: "TokenWeight", quorum: "0", threshold: "1" }],
  ];
  for (const [label, votePolicy] of variants) {
    const p = onChain();
    (role(p, "Approver").vote_policy as Record<string, unknown>).transfer = votePolicy;
    const reasons = rejected(p);
    assert.ok(reasons.includes("APPROVER_VOTE_POLICY"), `${label}: ${reasons}`);
  }
  const missing = onChain();
  role(missing, "Approver").vote_policy = {};
  assertRejects(missing, "APPROVER_VOTE_POLICY");

  // A fixed count above the one-member group is capped to one by Sputnik.
  const capped = onChain();
  role(capped, "Approver").vote_policy = {
    transfer: { weight_kind: "RoleWeight", quorum: "0", threshold: "3" },
  };
  assert.equal(checkPolicyConformance(capped, { gateId: GATE }).ok, true);
});

test("governance must need at least two and at least N-1 role-weighted approvals", () => {
  const threshold = onChain();
  threshold.default_vote_policy.threshold = "1";
  assertRejects(threshold, "GOVERNANCE_THRESHOLD");

  const ratio = onChain();
  ratio.default_vote_policy.threshold = [1, 2];
  assertRejects(ratio, "GOVERNANCE_THRESHOLD");

  const quorum = onChain();
  quorum.default_vote_policy.quorum = "1";
  assertRejects(quorum, "GOVERNANCE_QUORUM");

  const unreachable = onChain();
  unreachable.default_vote_policy.quorum = "4";
  assertRejects(unreachable, "GOVERNANCE_QUORUM");

  const token = onChain();
  token.default_vote_policy.weight_kind = "TokenWeight";
  assertRejects(token, "GOVERNANCE_WEIGHT_KIND");

  const four = buildGatedPolicy({ members: accounts(4), gateId: GATE });
  four.default_vote_policy.threshold = "2";
  assertRejects(four, "GOVERNANCE_THRESHOLD");
});

test("bounty, upgrade, staking and signalling kinds are forbidden for every role", () => {
  for (const perm of [
    "add_bounty:AddProposal",
    "bounty_done:VoteApprove",
    "upgrade_self:AddProposal",
    "upgrade_remote:VoteApprove",
    "set_vote_token:AddProposal",
    "vote:AddProposal",
  ]) {
    const p = onChain();
    role(p, "Admin").permissions.push(perm);
    assertRejects(p, `FORBIDDEN_PERMISSION:${perm}`);
  }
});

test("removal and hub actions are forbidden for every role", () => {
  for (const [roleName, perm] of [
    ["Requestor", "transfer:RemoveProposal"],
    ["Requestor", "transfer:VoteRemove"],
    ["Admin", "policy:VoteRemove"],
    ["Admin", "call:MoveToHub"],
    ["Approver", "transfer:VoteRemove"],
  ] as const) {
    const p = onChain();
    role(p, roleName).permissions.push(perm);
    assertRejects(p, `FORBIDDEN_PERMISSION:${perm}`);
  }
});

test("unknown permission labels are rejected", () => {
  const p = onChain();
  role(p, "Requestor").permissions.push("transfer:Teleport");
  assertRejects(p, "UNKNOWN_PERMISSION:transfer:Teleport");
});

test("admin members must equal requestor members", () => {
  const added = onChain();
  group(role(added, "Admin")).push(MALLORY);
  assertRejects(added, "ADMIN_REQUESTOR_MISMATCH");

  const removed = onChain();
  group(role(removed, "Admin")).pop();
  assertRejects(removed, "ADMIN_REQUESTOR_MISMATCH");
});

test("teams of one or more than sixteen are rejected", () => {
  const one = onChain();
  role(one, "Requestor").kind = { Group: ["accoryn-alice.testnet"] };
  role(one, "Admin").kind = { Group: ["accoryn-alice.testnet"] };
  assertRejects(one, "REQUESTOR_SIZE");

  const seventeen = onChain();
  role(seventeen, "Requestor").kind = { Group: accounts(17) };
  role(seventeen, "Admin").kind = { Group: accounts(17) };
  seventeen.default_vote_policy.threshold = "16";
  assertRejects(seventeen, "REQUESTOR_SIZE");
});

test("any role whose transfer threshold can be met with zero votes is rejected", () => {
  // Finalize evaluates every role; an effective threshold of zero approves with no votes.
  const requestor = onChain();
  role(requestor, "Requestor").vote_policy = {
    transfer: { weight_kind: "RoleWeight", quorum: "0", threshold: "0" },
  };
  assertRejects(requestor, "TRANSFER_THRESHOLD_ZERO:Requestor");

  const admin = onChain();
  role(admin, "Admin").vote_policy = {
    transfer: { weight_kind: "RoleWeight", quorum: "0", threshold: "0" },
  };
  assertRejects(admin, "TRANSFER_THRESHOLD_ZERO:Admin");

  const emptyGroup = onChain();
  emptyGroup.roles.push({
    name: "Observer",
    kind: { Group: [] },
    permissions: [],
    vote_policy: { transfer: { weight_kind: "RoleWeight", quorum: "0", threshold: [1, 2] } },
  });
  assertRejects(emptyGroup, "TRANSFER_THRESHOLD_ZERO:Observer");
});

test("role-level overrides cannot weaken governance", () => {
  const admin = onChain();
  role(admin, "Admin").vote_policy = {
    call: { weight_kind: "RoleWeight", quorum: "0", threshold: "1" },
  };
  assertRejects(admin, "GOVERNANCE_ROLE_POLICY:Admin:call");

  const spender = onChain();
  spender.roles.push({
    name: "Spender",
    kind: { Group: [MALLORY] },
    permissions: ["call:AddProposal", "call:VoteApprove"],
    vote_policy: { call: { weight_kind: "RoleWeight", quorum: "0", threshold: "1" } },
  });
  assertRejects(spender, "ROLE_UNEXPECTED:Spender");
  assertRejects(spender, "GOVERNANCE_ROLE_POLICY:Spender:call");
});

test("structural problems are reported", () => {
  const duplicate = onChain();
  duplicate.roles.push(structuredClone(role(duplicate, "Requestor")));
  assertRejects(duplicate, "ROLE_DUPLICATE_NAME:Requestor");

  const missing = onChain();
  missing.roles = missing.roles.filter((r) => r.name !== "Approver");
  assertRejects(missing, "ROLE_MISSING:Approver");
  assertRejects(missing, "APPROVER_MISSING");

  const gateHuman = onChain();
  group(role(gateHuman, "Requestor")).push(GATE);
  group(role(gateHuman, "Admin")).push(GATE);
  assertRejects(gateHuman, "GATE_IN_HUMAN_ROLE");
});

test("malformed policies are rejected without guessing", () => {
  const variants: unknown[] = [
    null,
    "policy",
    {},
    { ...onChain(), roles: "Requestor" },
    { ...onChain(), default_vote_policy: null },
    { ...onChain(), default_vote_policy: { weight_kind: "RoleWeight", quorum: 2, threshold: "2" } },
    { ...onChain(), default_vote_policy: { weight_kind: "RoleWeight", quorum: "2", threshold: "2.0" } },
    { ...onChain(), default_vote_policy: { weight_kind: "RoleWeight", quorum: "2", threshold: [1, 0] } },
    { ...onChain(), default_vote_policy: { weight_kind: "Votes", quorum: "2", threshold: "2" } },
  ];
  const badPermission = onChain();
  (role(badPermission, "Requestor").permissions as unknown[]).push(7);
  variants.push(badPermission);
  const badAccount = onChain();
  group(role(badAccount, "Requestor")).push("Not An Account");
  variants.push(badAccount);
  const badKind = onChain();
  (role(badKind, "Requestor") as { kind: unknown }).kind = { Group: MEMBERS, Member: "1" };
  variants.push(badKind);
  const dupMember = onChain();
  group(role(dupMember, "Requestor")).push(MEMBERS[0]);
  variants.push(dupMember);
  for (const v of variants)
    assert.deepEqual(checkPolicyConformance(v, { gateId: GATE }), {
      ok: false,
      reasons: ["MALFORMED"],
    }, JSON.stringify(v)?.slice(0, 200));
});
