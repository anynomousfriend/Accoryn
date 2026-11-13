// Sputnik DAO v2 (testnet factory sputnikv2.testnet, DAO code v2.3.1) JSON we
// read and write, plus the pure mappings from that JSON to the app's v1
// Proposal. Custody and voting stay in the DAO; nothing here signs or sends.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { Proposal } from "../../integration/services.ts";
import { validateProposal } from "../../integration/validation.ts";
import { isAccountId } from "../../workspace/drafts.ts";
import { buildGatedPolicy } from "./policy.ts";

export const SPUTNIK_FACTORY_ID = "sputnikv2.testnet";

// ---- Policy JSON (get_policy / DAO `new` args) ----------------------------
export type SputnikWeightKind = "RoleWeight" | "TokenWeight";
/** A fixed weight (U128 decimal string) or a ratio `[numerator, denominator]`. */
export type SputnikThreshold = string | [number, number];
export type SputnikVotePolicy = {
  weight_kind: SputnikWeightKind;
  quorum: string;
  threshold: SputnikThreshold;
};
/** `Group` and `permissions` are sets on-chain: read-back order is arbitrary. */
export type SputnikRoleKind = "Everyone" | { Member: string } | { Group: string[] };
export type SputnikRole = {
  name: string;
  kind: SputnikRoleKind;
  permissions: string[];
  vote_policy: Record<string, SputnikVotePolicy>;
};
export type SputnikPolicy = {
  roles: SputnikRole[];
  default_vote_policy: SputnikVotePolicy;
  proposal_bond: string;
  proposal_period: string;
  bounty_bond: string;
  bounty_forgiveness_period: string;
};

// ---- Proposal JSON (get_proposal) -----------------------------------------
export type SputnikProposalStatus =
  | "InProgress"
  | "Approved"
  | "Rejected"
  | "Removed"
  | "Expired"
  | "Moved"
  | "Failed";
export type SputnikVote = "Approve" | "Reject" | "Remove";
export type ParsedProposalKind =
  | {
      kind: "transfer";
      /** "" is native NEAR; otherwise a NEP-141 token contract. */
      tokenId: string;
      receiverId: string;
      amount: string;
      msg: string | null;
    }
  | { kind: "other"; label: string };
export type ParsedProposal = {
  id: number;
  proposer: string;
  description: string;
  kind: ParsedProposalKind;
  status: SputnikProposalStatus;
  /** Per role: [approve, reject, remove] as decimal strings. */
  voteCounts: Record<string, [string, string, string]>;
  votes: Record<string, SputnikVote>;
  submissionTimeNs: string;
};

/** ProposalKind variant -> policy label (`to_policy_label` in the contract). */
export const PROPOSAL_KIND_LABELS: Readonly<Record<string, string>> = {
  ChangeConfig: "config",
  ChangePolicy: "policy",
  AddMemberToRole: "add_member_to_role",
  RemoveMemberFromRole: "remove_member_from_role",
  FunctionCall: "call",
  UpgradeSelf: "upgrade_self",
  UpgradeRemote: "upgrade_remote",
  Transfer: "transfer",
  SetStakingContract: "set_vote_token",
  AddBounty: "add_bounty",
  BountyDone: "bounty_done",
  Vote: "vote",
  FactoryInfoUpdate: "factory_info_update",
  ChangePolicyAddOrUpdateRole: "policy_add_or_update_role",
  ChangePolicyRemoveRole: "policy_remove_role",
  ChangePolicyUpdateDefaultVotePolicy: "policy_update_default_vote_policy",
  ChangePolicyUpdateParameters: "policy_update_parameters",
};
const STATUSES: readonly string[] = [
  "InProgress",
  "Approved",
  "Rejected",
  "Removed",
  "Expired",
  "Moved",
  "Failed",
];
const VOTES: readonly string[] = ["Approve", "Reject", "Remove"];
const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const NS_PER_MS = 1_000_000n;
const CONTROL = /[\u0000-\u001f]/;

const malformed = (what: string): never => {
  throw new Error(`Sputnik response is malformed: ${what}.`);
};
const declined = (why: string): never => {
  throw new Error(`This proposal cannot be shown in the app: ${why}.`);
};
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const own = (v: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(v, key);
const sameKeys = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).length === keys.length && keys.every((k) => own(v, k));
function decimal(v: unknown, max: bigint): v is string {
  return (
    typeof v === "string" &&
    v.length <= 39 &&
    /^(0|[1-9][0-9]*)$/.test(v) &&
    BigInt(v) <= max
  );
}
const account = (v: unknown): v is string => typeof v === "string" && isAccountId(v);

function parseKind(kind: unknown): ParsedProposalKind {
  if (typeof kind === "string") {
    const label = PROPOSAL_KIND_LABELS[kind];
    if (!own(PROPOSAL_KIND_LABELS, kind) || kind === "Transfer") return malformed("kind");
    return { kind: "other", label };
  }
  if (!isRecord(kind)) return malformed("kind");
  const variants = Object.keys(kind);
  if (variants.length !== 1 || !own(PROPOSAL_KIND_LABELS, variants[0]))
    return malformed("kind");
  const variant = variants[0];
  if (variant !== "Transfer")
    return { kind: "other", label: PROPOSAL_KIND_LABELS[variant] };
  const t = kind.Transfer;
  if (!isRecord(t) || !sameKeys(t, ["token_id", "receiver_id", "amount", "msg"]))
    return malformed("transfer");
  if (typeof t.token_id !== "string" || (t.token_id !== "" && !isAccountId(t.token_id)))
    return malformed("transfer token");
  if (!account(t.receiver_id)) return malformed("transfer receiver");
  if (!decimal(t.amount, U128_MAX)) return malformed("transfer amount");
  if (t.msg !== null && typeof t.msg !== "string") return malformed("transfer msg");
  return {
    kind: "transfer",
    tokenId: t.token_id,
    receiverId: t.receiver_id,
    amount: t.amount,
    msg: t.msg,
  };
}

// v2.3.1 serialises vote counts as JSON numbers; later code uses U128 strings.
function count(v: unknown): string {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return String(v);
  if (decimal(v, U128_MAX)) return v;
  return malformed("vote count");
}

/** Strictly parse a `get_proposal` result. Unknown extra fields such as
 * `last_actions_log` (absent on testnet v2.3.1) are ignored. */
export function parseProposal(raw: unknown): ParsedProposal {
  if (!isRecord(raw)) return malformed("proposal");
  for (const key of ["id", "proposer", "description", "kind", "status", "vote_counts", "votes", "submission_time"])
    if (!own(raw, key)) malformed(key);
  const { id, proposer, description, status, vote_counts, votes, submission_time } = raw;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0) return malformed("id");
  if (!account(proposer)) return malformed("proposer");
  if (typeof description !== "string") return malformed("description");
  if (typeof status !== "string" || !STATUSES.includes(status)) return malformed("status");
  if (!decimal(submission_time, U64_MAX)) return malformed("submission_time");
  if (!isRecord(vote_counts)) return malformed("vote_counts");
  const voteCounts = Object.fromEntries(
    Object.entries(vote_counts).map(([role, c]): [string, [string, string, string]] => {
      if (!role || role.length > 100 || !Array.isArray(c) || c.length !== 3)
        return malformed("vote_counts");
      return [role, [count(c[0]), count(c[1]), count(c[2])]];
    }),
  );
  if (!isRecord(votes)) return malformed("votes");
  const voteMap = Object.fromEntries(
    Object.entries(votes).map(([voter, vote]): [string, SputnikVote] => {
      if (!isAccountId(voter) || typeof vote !== "string" || !VOTES.includes(vote))
        return malformed("votes");
      return [voter, vote as SputnikVote];
    }),
  );
  return {
    id,
    proposer,
    description,
    kind: parseKind(raw.kind),
    status: status as SputnikProposalStatus,
    voteCounts,
    votes: voteMap,
    submissionTimeNs: submission_time,
  };
}

// ---- Description codec ----------------------------------------------------
export type DescriptionTag = { req: string; draft?: string; inv?: string };
const TAG_MARKER = "\n\naccoryn:v1:";
const TAG_KEYS: readonly string[] = ["req", "draft", "inv"];

/** Same rules as `validateDraft` purpose: non-blank, at most 500 chars, no
 * U+0000-U+001F (so never a newline, which keeps the tag split unambiguous). */
export function isValidPurpose(purpose: unknown): purpose is string {
  return (
    typeof purpose === "string" &&
    purpose.trim().length > 0 &&
    purpose.length <= 500 &&
    !CONTROL.test(purpose)
  );
}
const tagValue = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 200 && !CONTROL.test(v);
function canonicalTag(tag: unknown): DescriptionTag | null {
  if (!isRecord(tag) || Object.keys(tag).some((k) => !TAG_KEYS.includes(k))) return null;
  if (!tagValue(tag.req)) return null;
  const out: DescriptionTag = { req: tag.req };
  if (own(tag, "draft")) {
    if (!tagValue(tag.draft)) return null;
    out.draft = tag.draft;
  }
  if (own(tag, "inv")) {
    if (!tagValue(tag.inv)) return null;
    out.inv = tag.inv;
  }
  return out;
}

export function encodeDescription(purpose: string, tag: DescriptionTag): string {
  if (!isValidPurpose(purpose))
    throw new Error("Purpose must be 1-500 characters on a single line.");
  const canonical = canonicalTag(tag);
  if (!canonical) throw new Error("Proposal tag needs a request ID and only known fields.");
  return `${purpose}${TAG_MARKER}${JSON.stringify(canonical)}`;
}

/** Split at the last tag marker. Anything that is not exactly what
 * `encodeDescription` would produce is treated as an untagged description. */
export function parseDescription(description: string): {
  purpose: string;
  tag: DescriptionTag | null;
} {
  const untagged = { purpose: description, tag: null };
  if (typeof description !== "string") return untagged;
  const at = description.lastIndexOf(TAG_MARKER);
  if (at < 0) return untagged;
  const purpose = description.slice(0, at);
  let parsed: unknown;
  try {
    parsed = JSON.parse(description.slice(at + TAG_MARKER.length));
  } catch {
    return untagged;
  }
  const tag = canonicalTag(parsed);
  if (!tag || !isValidPurpose(purpose)) return untagged;
  if (encodeDescription(purpose, tag) !== description) return untagged;
  return { purpose, tag };
}

// ---- Content hash ---------------------------------------------------------
function proposalIdText(id: unknown): string {
  if (typeof id === "number" && Number.isSafeInteger(id) && id >= 0) return String(id);
  if (decimal(id, U64_MAX)) return id;
  throw new Error("Proposal ID must be a non-negative integer.");
}

/** Lowercase hex sha256 binding the network, DAO, proposal and its full
 * on-chain description (purpose and tag) for a native transfer. */
export function proposalContentHash(input: {
  network: "testnet";
  daoId: string;
  proposalId: string | number;
  receiverId: string;
  amountAtomic: string;
  description: string;
}): string {
  if (input.network !== "testnet") throw new Error("Only testnet is supported.");
  if (!account(input.daoId) || !account(input.receiverId))
    throw new Error("Content hash needs valid NEAR account IDs.");
  if (!decimal(input.amountAtomic, U128_MAX))
    throw new Error("Content hash needs a canonical atomic amount.");
  if (typeof input.description !== "string")
    throw new Error("Content hash needs the on-chain description.");
  const tuple = [
    "accoryn-proposal-v1",
    "testnet",
    input.daoId,
    proposalIdText(input.proposalId),
    input.receiverId,
    input.amountAtomic,
    "native",
    input.description,
  ];
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(tuple))));
}

// ---- Status and app mapping -----------------------------------------------
function expiryNs(submissionTimeNs: unknown, proposalPeriodNs: unknown): bigint {
  if (!decimal(submissionTimeNs, U64_MAX) || !decimal(proposalPeriodNs, U64_MAX))
    throw new Error("Proposal timing must be canonical nanosecond integers.");
  return BigInt(submissionTimeNs) + BigInt(proposalPeriodNs);
}

/** Moved proposals are declined (thrown). The app treats a proposal as no
 * longer approvable from the instant it reaches its expiry. */
export function mapProposalStatus(input: {
  status: string;
  submissionTimeNs: string;
  proposalPeriodNs: string;
  nowMs: number;
  settlementVerified: boolean;
}): Proposal["status"] {
  const expiry = expiryNs(input.submissionTimeNs, input.proposalPeriodNs);
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0)
    throw new Error("Current time must be integer milliseconds.");
  switch (input.status) {
    case "InProgress":
      return BigInt(input.nowMs) * NS_PER_MS < expiry ? "pending" : "rejected";
    case "Approved":
      return input.settlementVerified === true ? "settled" : "unknown";
    case "Failed":
      return "failed";
    case "Rejected":
    case "Expired":
    case "Removed":
      return "rejected";
    case "Moved":
      return declined("moved proposals are not supported");
    default:
      throw new Error("Unknown Sputnik proposal status.");
  }
}

export function toAppProposal(input: {
  daoId: string;
  raw: unknown;
  policy: SputnikPolicy;
  nowMs: number;
  attestations: string[];
  requiredAttendees: number;
  settlementVerified: boolean;
}): Proposal {
  if (!account(input.daoId)) throw new Error("Invalid DAO account ID.");
  const p = parseProposal(input.raw);
  if (p.kind.kind !== "transfer") return declined("only transfers are supported");
  if (p.kind.tokenId !== "") return declined("only native NEAR transfers are supported");
  if (p.kind.msg !== null) return declined("native transfers must not carry a message");
  const status = mapProposalStatus({
    status: p.status,
    submissionTimeNs: p.submissionTimeNs,
    proposalPeriodNs: input.policy?.proposal_period,
    nowMs: input.nowMs,
    settlementVerified: input.settlementVerified,
  });
  const expiresAt = new Date(
    Number(expiryNs(p.submissionTimeNs, input.policy.proposal_period) / NS_PER_MS),
  ).toISOString();
  return validateProposal({
    network: "testnet",
    asset: "native",
    id: String(p.id),
    contentHash: proposalContentHash({
      network: "testnet",
      daoId: input.daoId,
      proposalId: p.id,
      receiverId: p.kind.receiverId,
      amountAtomic: p.kind.amount,
      description: p.description,
    }),
    treasuryId: input.daoId,
    recipient: p.kind.receiverId,
    amountAtomic: p.kind.amount,
    purpose: parseDescription(p.description).purpose,
    status,
    approvals: Array.isArray(input.attestations) ? [...input.attestations] : input.attestations,
    requiredApprovals: input.requiredAttendees,
    expiresAt,
  });
}

// ---- DAO creation ---------------------------------------------------------
/** Factory sub-account label: slug(team) + "-" + 8 hex of sha256(requestId).
 * The same request always derives the same name, so retries are idempotent. */
export function deriveDaoName(teamName: string, requestId: string): string {
  if (typeof teamName !== "string") throw new Error("Team name must be text.");
  if (typeof requestId !== "string" || requestId.length === 0)
    throw new Error("A request ID is required to name the DAO.");
  const slug =
    teamName
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20)
      .replace(/-+$/, "") || "team";
  return `${slug}-${bytesToHex(sha256(utf8ToBytes(requestId))).slice(0, 8)}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Arguments for `sputnikv2.testnet` `create({ name, args })`; `args` is the
 * base64 JSON of the DAO `new({ config, policy })` call. */
export function buildCreateDaoArgs(input: {
  name: string;
  purpose: string;
  members: string[];
  gateId: string;
}): { name: string; args: string } {
  const { name, purpose } = input;
  if (
    typeof name !== "string" ||
    !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(name) ||
    !isAccountId(`${name}.${SPUTNIK_FACTORY_ID}`)
  )
    throw new Error("DAO name must be a short lowercase sub-account label.");
  if (typeof purpose !== "string" || purpose.length > 500 || CONTROL.test(purpose))
    throw new Error("DAO purpose must be at most 500 characters on a single line.");
  const policy = buildGatedPolicy({ members: input.members, gateId: input.gateId });
  const json = JSON.stringify({ config: { name, purpose, metadata: "" }, policy });
  return { name, args: toBase64(utf8ToBytes(json)) };
}
