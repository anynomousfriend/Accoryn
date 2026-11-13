import { isAccountId } from "../workspace/drafts.ts";
import type {
  Account,
  Treasury,
  Proposal,
  AcousticEvidence,
} from "./services.ts";
const bad = (): never => {
  throw new Error(
    "The service returned incompatible data. Reconcile before continuing.",
  );
};
const text = (x: unknown, max = 200): x is string =>
  typeof x === "string" && x.length > 0 && x.length <= max;
const amount = (x: unknown) =>
  text(x, 39) && /^(0|[1-9]\d*)$/.test(x) && BigInt(x) <= (1n << 128n) - 1n;
const date = (x: unknown) =>
  typeof x === "string" && Number.isFinite(Date.parse(x));
const accounts = (x: unknown): x is string[] =>
  Array.isArray(x) &&
  x.length <= 1000 &&
  x.every((v) => typeof v === "string" && isAccountId(v)) &&
  new Set(x).size === x.length;
export function validateAccount(value: unknown): Account {
  const v = value as Account;
  if (
    !v ||
    v.network !== "testnet" ||
    typeof v.accountId !== "string" ||
    !isAccountId(v.accountId)
  )
    return bad();
  return { network: "testnet", accountId: v.accountId };
}
export function validateTreasury(value: unknown): Treasury {
  const v = value as Treasury;
  if (
    !v ||
    v.network !== "testnet" ||
    !text(v.id) ||
    !isAccountId(v.id) ||
    !text(v.policyVersion) ||
    !amount(v.balanceAtomic) ||
    !Array.isArray(v.members) ||
    v.members.length < 1 ||
    v.members.length > 1000 ||
    !Number.isInteger(v.requiredApprovals) ||
    v.requiredApprovals < 1 ||
    v.requiredApprovals > v.members.length
  )
    return bad();
  if (
    !accounts(v.members.map((m) => m?.accountId)) ||
    v.members.some((m) => !text(m.role))
  )
    return bad();
  return {
    network: "testnet",
    id: v.id,
    policyVersion: v.policyVersion,
    balanceAtomic: v.balanceAtomic,
    requiredApprovals: v.requiredApprovals,
    members: v.members.map((m) => ({ accountId: m.accountId, role: m.role })),
  };
}
export function validateProposal(value: unknown): Proposal {
  const v = value as Proposal;
  if (
    !v ||
    v.network !== "testnet" ||
    v.asset !== "native" ||
    !text(v.id) ||
    !text(v.contentHash) ||
    !text(v.treasuryId) ||
    !isAccountId(v.treasuryId) ||
    !text(v.recipient) ||
    !isAccountId(v.recipient) ||
    !amount(v.amountAtomic) ||
    BigInt(v.amountAtomic) <= 0n ||
    !text(v.purpose, 500) ||
    !["pending", "unknown", "failed", "settled", "rejected"].includes(
      v.status,
    ) ||
    !accounts(v.approvals) ||
    !Number.isInteger(v.requiredApprovals) ||
    v.requiredApprovals < 1 ||
    v.requiredApprovals > 1000 ||
    !date(v.expiresAt)
  )
    return bad();
  return {
    network: "testnet",
    asset: "native",
    id: v.id,
    contentHash: v.contentHash,
    treasuryId: v.treasuryId,
    recipient: v.recipient,
    amountAtomic: v.amountAtomic,
    purpose: v.purpose,
    status: v.status,
    approvals: [...v.approvals],
    requiredApprovals: v.requiredApprovals,
    expiresAt: v.expiresAt,
  };
}
export function validateEvidence(value: unknown): AcousticEvidence {
  const v = value as AcousticEvidence;
  if (
    !v ||
    !text(v.proposalId) ||
    !text(v.contentHash) ||
    !date(v.expiresAt) ||
    !accounts(v.participantIds) ||
    !v.participantIds.length
  )
    return bad();
  return {
    proposalId: v.proposalId,
    contentHash: v.contentHash,
    expiresAt: v.expiresAt,
    participantIds: [...v.participantIds],
  };
}
