// Gated Sputnik policy: humans propose, reject and finalize transfers and
// govern with G = max(2, N-1) approvals; only the ceremony gate contract can
// approve a Transfer proposal. Governance is not gated: G members can still
// change the policy or approve function calls (which may attach deposits).
// The conformance check mirrors Sputnik v2 vote arithmetic (policy.rs
// `proposal_status` / `to_weight`, and Finalize evaluating every role) so a
// policy read from the chain cannot let any account but the gate approve a
// transfer, nor let fewer than G members pass a governance proposal.
import { isAccountId } from "../../workspace/drafts.ts";
import type { SputnikPolicy } from "./sputnik.ts";

export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 16;
export const DEFAULT_PROPOSAL_PERIOD_NS = "259200000000000"; // 3 days
const BOUNTY_BOND = "1000000000000000000000000";
const BOUNTY_FORGIVENESS_PERIOD_NS = "86400000000000"; // 1 day
const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;

/** Policy labels of every Sputnik v2 proposal kind. */
export const KIND_LABELS = [
  "config",
  "policy",
  "add_member_to_role",
  "remove_member_from_role",
  "call",
  "upgrade_self",
  "upgrade_remote",
  "transfer",
  "set_vote_token",
  "add_bounty",
  "bounty_done",
  "vote",
  "factory_info_update",
  "policy_add_or_update_role",
  "policy_remove_role",
  "policy_update_default_vote_policy",
  "policy_update_parameters",
] as const;
export const ACTION_LABELS = [
  "AddProposal",
  "RemoveProposal",
  "VoteApprove",
  "VoteReject",
  "VoteRemove",
  "Finalize",
  "MoveToHub",
] as const;
const GOVERNANCE_KINDS = [
  "config",
  "policy",
  "policy_add_or_update_role",
  "policy_remove_role",
  "policy_update_default_vote_policy",
  "policy_update_parameters",
  "add_member_to_role",
  "remove_member_from_role",
  "call",
  "factory_info_update",
] as const;
const GOVERNANCE_ACTIONS = ["AddProposal", "VoteApprove", "VoteReject", "Finalize"] as const;
const FORBIDDEN_KINDS: readonly string[] = [
  "upgrade_self",
  "upgrade_remote",
  "add_bounty",
  "bounty_done",
  "set_vote_token",
  "vote",
];
const FORBIDDEN_ACTIONS: readonly string[] = ["RemoveProposal", "VoteRemove", "MoveToHub"];
const ROLE_NAMES = ["Requestor", "Admin", "Approver"] as const;
const KINDS: readonly string[] = KIND_LABELS;
const ACTIONS: readonly string[] = ACTION_LABELS;

const canonical = (v: unknown, max: bigint): v is string =>
  typeof v === "string" &&
  v.length <= 39 &&
  /^(0|[1-9][0-9]*)$/.test(v) &&
  BigInt(v) <= max;

export function governanceThreshold(n: number): number {
  if (!Number.isSafeInteger(n) || n < 1)
    throw new Error("Team size must be a positive integer.");
  return Math.max(2, n - 1);
}

export function buildGatedPolicy(input: {
  members: string[];
  gateId: string;
  proposalPeriodNs?: string;
}): SputnikPolicy {
  const { members, gateId } = input;
  const proposalPeriodNs = input.proposalPeriodNs ?? DEFAULT_PROPOSAL_PERIOD_NS;
  if (
    !Array.isArray(members) ||
    members.length < MIN_MEMBERS ||
    members.length > MAX_MEMBERS
  )
    throw new Error(`A team needs ${MIN_MEMBERS}-${MAX_MEMBERS} members.`);
  if (!members.every((m) => typeof m === "string" && isAccountId(m)))
    throw new Error("Every member must be a valid NEAR account ID.");
  if (new Set(members).size !== members.length)
    throw new Error("Members must be unique.");
  if (typeof gateId !== "string" || !isAccountId(gateId))
    throw new Error("The ceremony gate must be a valid NEAR account ID.");
  if (members.includes(gateId))
    throw new Error("The ceremony gate cannot be a team member.");
  if (!canonical(proposalPeriodNs, U64_MAX) || proposalPeriodNs === "0")
    throw new Error("Proposal period must be a positive nanosecond integer.");
  return {
    roles: [
      {
        name: "Requestor",
        kind: { Group: [...members] },
        permissions: ["transfer:AddProposal", "transfer:VoteReject", "transfer:Finalize"],
        vote_policy: {
          transfer: { weight_kind: "RoleWeight", quorum: "0", threshold: [1, 2] },
        },
      },
      {
        name: "Admin",
        kind: { Group: [...members] },
        permissions: GOVERNANCE_KINDS.flatMap((k) =>
          GOVERNANCE_ACTIONS.map((a) => `${k}:${a}`),
        ),
        vote_policy: {},
      },
      {
        name: "Approver",
        kind: { Group: [gateId] },
        permissions: ["transfer:VoteApprove"],
        vote_policy: {
          transfer: { weight_kind: "RoleWeight", quorum: "0", threshold: "1" },
        },
      },
    ],
    default_vote_policy: {
      weight_kind: "RoleWeight",
      quorum: "2",
      threshold: String(governanceThreshold(members.length)),
    },
    proposal_bond: "0",
    proposal_period: proposalPeriodNs,
    bounty_bond: BOUNTY_BOND,
    bounty_forgiveness_period: BOUNTY_FORGIVENESS_PERIOD_NS,
  };
}

// ---- Strict structural parse ----------------------------------------------
type Threshold = { weight: bigint } | { num: bigint; den: bigint };
type VotePolicy = { roleWeight: boolean; quorum: bigint; threshold: Threshold };
type Kind =
  | { type: "everyone" }
  | { type: "member" }
  | { type: "group"; accounts: string[] };
type Role = {
  name: string;
  kind: Kind;
  permissions: string[];
  votePolicy: Map<string, VotePolicy>;
};
type Parsed = { roles: Role[]; defaultVotePolicy: VotePolicy };

class Malformed extends Error {}
const fail = (): never => {
  throw new Malformed("MALFORMED");
};
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
function exact(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !isRecord(v) ||
    Object.keys(v).length !== keys.length ||
    !keys.every((k) => Object.prototype.hasOwnProperty.call(v, k))
  )
    return fail();
  return v;
}
const u64Number = (v: unknown): bigint =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : fail();

function parseVotePolicy(raw: unknown): VotePolicy {
  const v = exact(raw, ["weight_kind", "quorum", "threshold"]);
  if (v.weight_kind !== "RoleWeight" && v.weight_kind !== "TokenWeight") fail();
  if (!canonical(v.quorum, U128_MAX)) fail();
  let threshold: Threshold;
  if (canonical(v.threshold, U128_MAX)) threshold = { weight: BigInt(v.threshold) };
  else if (Array.isArray(v.threshold) && v.threshold.length === 2) {
    threshold = { num: u64Number(v.threshold[0]), den: u64Number(v.threshold[1]) };
    if (threshold.den === 0n) fail();
  } else return fail();
  return {
    roleWeight: v.weight_kind === "RoleWeight",
    quorum: BigInt(v.quorum as string),
    threshold,
  };
}

function parseKind(raw: unknown): Kind {
  if (raw === "Everyone") return { type: "everyone" };
  if (isRecord(raw) && Object.keys(raw).length === 1 && "Member" in raw) {
    if (!canonical(raw.Member, U128_MAX)) fail();
    return { type: "member" };
  }
  const g = exact(raw, ["Group"]).Group;
  if (
    !Array.isArray(g) ||
    g.length > 1000 ||
    !g.every((a) => typeof a === "string" && isAccountId(a)) ||
    new Set(g).size !== g.length
  )
    fail();
  return { type: "group", accounts: [...(g as string[])] };
}

function parseRole(raw: unknown): Role {
  const r = exact(raw, ["name", "kind", "permissions", "vote_policy"]);
  if (typeof r.name !== "string" || !r.name || r.name.length > 100) fail();
  const perms = r.permissions;
  if (
    !Array.isArray(perms) ||
    perms.length > 1000 ||
    !perms.every((p) => typeof p === "string" && p.length > 0 && p.length <= 200) ||
    new Set(perms).size !== perms.length
  )
    fail();
  if (!isRecord(r.vote_policy)) fail();
  const votePolicy = new Map<string, VotePolicy>();
  for (const [label, vp] of Object.entries(r.vote_policy as Record<string, unknown>)) {
    if (!KINDS.includes(label)) fail();
    votePolicy.set(label, parseVotePolicy(vp));
  }
  return {
    name: r.name as string,
    kind: parseKind(r.kind),
    permissions: [...(perms as string[])],
    votePolicy,
  };
}

function parsePolicy(raw: unknown): Parsed {
  const p = exact(raw, [
    "roles",
    "default_vote_policy",
    "proposal_bond",
    "proposal_period",
    "bounty_bond",
    "bounty_forgiveness_period",
  ]);
  if (!Array.isArray(p.roles) || p.roles.length > 100) fail();
  if (!canonical(p.proposal_bond, U128_MAX) || !canonical(p.bounty_bond, U128_MAX)) fail();
  if (!canonical(p.proposal_period, U64_MAX) || !canonical(p.bounty_forgiveness_period, U64_MAX))
    fail();
  return {
    roles: (p.roles as unknown[]).map(parseRole),
    defaultVotePolicy: parseVotePolicy(p.default_vote_policy),
  };
}

// ---- Sputnik vote arithmetic ----------------------------------------------
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);
function toWeight(t: Threshold, total: bigint): bigint {
  return "weight" in t ? min(t.weight, total) : min((t.num * total) / t.den + 1n, total);
}
/** Votes a role needs for a kind: max(quorum, threshold.to_weight(total)).
 * Member roles and token weighting depend on the delegated supply, which can
 * be zero, so the worst case (total = 0) is used for them. */
function effectiveThreshold(role: Role, vp: VotePolicy): bigint {
  const total =
    role.kind.type === "group" && vp.roleWeight ? BigInt(role.kind.accounts.length) : 0n;
  return max(vp.quorum, toWeight(vp.threshold, total));
}
/** Same matching as Sputnik `can_execute_action`. */
const allows = (role: Role, kind: string, action: string) =>
  [`${kind}:${action}`, `${kind}:*`, `*:${action}`, "*:*"].some((p) =>
    role.permissions.includes(p),
  );
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export type PolicyConformance =
  | { ok: true; members: string[]; governanceApprovals: number }
  | { ok: false; reasons: string[] };

/** Strict check that a policy keeps transfer approval with the gate alone.
 * Reasons are stable codes; `MALFORMED` is returned alone when the JSON is not
 * a policy this check can reason about. */
export function checkPolicyConformance(
  policy: unknown,
  options: { gateId: string },
): PolicyConformance {
  const gateId = options?.gateId;
  if (typeof gateId !== "string" || !isAccountId(gateId))
    throw new Error("Conformance needs the ceremony gate account ID.");
  let parsed: Parsed;
  try {
    parsed = parsePolicy(policy);
  } catch (error) {
    if (error instanceof Malformed) return { ok: false, reasons: ["MALFORMED"] };
    throw error;
  }
  const reasons = new Set<string>();
  const { roles, defaultVotePolicy } = parsed;
  const byName = (name: string) => roles.find((r) => r.name === name);
  const groupOf = (role: Role | undefined) =>
    role?.kind.type === "group" ? role.kind.accounts : null;

  const seen = new Set<string>();
  for (const role of roles) {
    if (seen.has(role.name)) reasons.add(`ROLE_DUPLICATE_NAME:${role.name}`);
    seen.add(role.name);
    if (!(ROLE_NAMES as readonly string[]).includes(role.name))
      reasons.add(`ROLE_UNEXPECTED:${role.name}`);
  }
  for (const name of ROLE_NAMES) if (!seen.has(name)) reasons.add(`ROLE_MISSING:${name}`);

  // Team size and governance threshold.
  const requestors = groupOf(byName("Requestor"));
  const n = requestors?.length ?? 0;
  const sizeOk = requestors !== null && n >= MIN_MEMBERS && n <= MAX_MEMBERS;
  if (!sizeOk) reasons.add("REQUESTOR_SIZE");
  const admins = groupOf(byName("Admin"));
  if (!requestors || !admins || !sameSet(requestors, admins))
    reasons.add("ADMIN_REQUESTOR_MISMATCH");
  const required = BigInt(sizeOk ? governanceThreshold(n) : MIN_MEMBERS);

  if (!defaultVotePolicy.roleWeight) reasons.add("GOVERNANCE_WEIGHT_KIND");
  const t = defaultVotePolicy.threshold;
  if (!("weight" in t) || t.weight < 2n || t.weight < required)
    reasons.add("GOVERNANCE_THRESHOLD");
  if (defaultVotePolicy.quorum < 2n || (sizeOk && defaultVotePolicy.quorum > BigInt(n)))
    reasons.add("GOVERNANCE_QUORUM");

  let approvers = 0;
  for (const role of roles) {
    const group = role.kind.type === "group" ? role.kind.accounts : null;
    const gateOnly = group !== null && group.length === 1 && group[0] === gateId;
    if (role.kind.type === "everyone") reasons.add("ROLE_EVERYONE");
    if (role.kind.type === "member") reasons.add("ROLE_MEMBER_KIND");
    if ((role.name === "Requestor" || role.name === "Admin") && group?.includes(gateId))
      reasons.add("GATE_IN_HUMAN_ROLE");

    for (const perm of role.permissions) {
      const parts = perm.split(":");
      const [kind, action] = parts;
      if (parts.length !== 2 || !(kind === "*" || KINDS.includes(kind)) || !(action === "*" || ACTIONS.includes(action)))
        reasons.add(`UNKNOWN_PERMISSION:${perm}`);
      if (kind === "*" || action === "*") reasons.add(`WILDCARD_PERMISSION:${perm}`);
      if (FORBIDDEN_KINDS.includes(kind) || FORBIDDEN_ACTIONS.includes(action))
        reasons.add(`FORBIDDEN_PERMISSION:${perm}`);
    }

    if (allows(role, "transfer", "VoteApprove")) {
      if (gateOnly) {
        approvers += 1;
        const vp = role.votePolicy.get("transfer");
        if (
          !vp ||
          !vp.roleWeight ||
          vp.quorum !== 0n ||
          !("weight" in vp.threshold) ||
          vp.threshold.weight < 1n
        )
          reasons.add("APPROVER_VOTE_POLICY");
      } else if (group?.includes(gateId)) reasons.add("APPROVER_NOT_GATE_ONLY");
      else reasons.add("HUMAN_CAN_APPROVE_TRANSFER");
    }

    for (const [label, vp] of role.votePolicy)
      if (!vp.roleWeight) reasons.add(`VOTE_POLICY_WEIGHT_KIND:${role.name}:${label}`);

    // Finalize evaluates every role; a role needing zero votes approves at once.
    if (role.kind.type !== "everyone") {
      const transfer = role.votePolicy.get("transfer") ?? defaultVotePolicy;
      if (effectiveThreshold(role, transfer) < 1n)
        reasons.add(`TRANSFER_THRESHOLD_ZERO:${role.name}`);
      for (const label of KINDS) {
        if (label === "transfer") continue;
        const override = role.votePolicy.get(label);
        if (!override && !allows(role, label, "VoteApprove")) continue;
        if (effectiveThreshold(role, override ?? defaultVotePolicy) < max(2n, required))
          reasons.add(`GOVERNANCE_ROLE_POLICY:${role.name}:${label}`);
      }
    }
  }
  if (approvers === 0) reasons.add("APPROVER_MISSING");

  if (reasons.size > 0 || !requestors) return { ok: false, reasons: [...reasons] };
  return {
    ok: true,
    members: [...requestors].sort(),
    governanceApprovals: Number(effectiveThreshold(byName("Admin") as Role, defaultVotePolicy)),
  };
}
