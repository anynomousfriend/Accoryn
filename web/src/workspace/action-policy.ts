import type { PaymentDraft } from "./drafts.ts";
import { totalAtomic } from "./drafts.ts";
import type { Proposal, Account, Treasury } from "../integration/services.ts";
import {
  validateAccount,
  validateTreasury,
  validateProposal,
} from "../integration/validation.ts";
import type { PendingAction } from "./action-journal.ts";
import { actionConfirmed } from "./action-journal.ts";
import type { ProposalRef } from "./storage.ts";
export type ActionInput =
  | { kind: "proposePayment"; draft: PaymentDraft }
  | {
      kind: "approveProposal" | "executeProposal";
      proposal: Proposal;
      actor: string | null;
      refs: readonly ProposalRef[];
    }
  | { kind: "openAccount" | "recoverAccount" | "createTreasury" }
  | { kind: "joinTreasury"; treasuryId: string };
export function makeActionIntent(
  input: ActionInput,
  requestId: string,
  startedAt: string,
): PendingAction {
  const base: PendingAction = {
    requestId,
    kind: input.kind,
    treasuryId: "unassigned",
    draftId: null,
    proposalId: null,
    startedAt,
  };
  if (input.kind === "proposePayment")
    return {
      ...base,
      treasuryId: input.draft.treasuryId,
      draftId: input.draft.id,
      expected: {
        recipient: input.draft.recipient,
        amountAtomic: totalAtomic(input.draft),
        purpose: input.draft.purpose,
        contentHash: null,
        actor: null,
      },
    };
  if (input.kind === "approveProposal" || input.kind === "executeProposal") {
    const p = validateProposal(input.proposal);
    const link = input.refs.find(
      (r) =>
        r.proposalId === p.id &&
        r.treasuryId === p.treasuryId &&
        r.contentHash === p.contentHash,
    );
    return {
      ...base,
      treasuryId: p.treasuryId,
      proposalId: p.id,
      draftId: link?.draftId ?? null,
      expected: {
        recipient: p.recipient,
        amountAtomic: p.amountAtomic,
        purpose: p.purpose,
        contentHash: p.contentHash,
        actor: input.actor,
      },
    };
  }
  return input.kind === "joinTreasury"
    ? { ...base, treasuryId: input.treasuryId }
    : base;
}
export function validateFinancialProposal(
  intent: PendingAction,
  value: unknown,
): Proposal {
  const p = validateProposal(value);
  const expected = intent.expected;
  if (
    !expected ||
    p.treasuryId !== intent.treasuryId ||
    p.recipient !== expected.recipient ||
    p.amountAtomic !== expected.amountAtomic ||
    p.purpose !== expected.purpose ||
    (intent.proposalId !== null && p.id !== intent.proposalId) ||
    (expected.contentHash !== null && p.contentHash !== expected.contentHash)
  )
    throw new Error(
      "Recovered proposal does not match the original payment intent.",
    );
  if (
    intent.kind === "approveProposal" &&
    (!expected.actor || !p.approvals.includes(expected.actor))
  )
    throw new Error("Approval is not confirmed for the original participant.");
  return p;
}
export type RecoveryDecision = {
  clear: boolean;
  status: "pending" | "unknown" | "confirmed" | "rejected";
  proposal?: Proposal;
  account?: Account;
  treasury?: Treasury;
  reference?: ProposalRef;
};
export function validateReconciliation(
  intent: PendingAction,
  value: unknown,
): RecoveryDecision {
  const result = value as {
    requestId?: string;
    status?: string;
    outcome?: {
      kind?: string;
      proposal?: unknown;
      account?: unknown;
      treasury?: unknown;
    };
  };
  if (
    !result ||
    result.requestId !== intent.requestId ||
    !["pending", "unknown", "confirmed", "rejected"].includes(
      result.status ?? "",
    )
  )
    throw new Error("Unrelated or invalid action recovery result.");
  if (result.status !== "confirmed")
    return {
      clear: result.status === "rejected",
      status: result.status as RecoveryDecision["status"],
    };
  const out = result.outcome;
  if (!out || out.kind !== intent.kind)
    throw new Error(
      "Confirmed recovery requires the original action and its canonical outcome.",
    );
  if (
    ["proposePayment", "approveProposal", "executeProposal"].includes(
      intent.kind,
    )
  ) {
    const p = validateFinancialProposal(intent, out.proposal);
    return {
      clear: actionConfirmed(intent.kind, p.status),
      status: "confirmed",
      proposal: p,
      ...(intent.draftId
        ? {
            reference: {
              draftId: intent.draftId,
              treasuryId: p.treasuryId,
              proposalId: p.id,
              contentHash: p.contentHash,
            },
          }
        : {}),
    };
  }
  if (intent.kind === "openAccount" || intent.kind === "recoverAccount")
    return {
      clear: true,
      status: "confirmed",
      account: validateAccount(out.account),
    };
  if (intent.kind === "createTreasury" || intent.kind === "joinTreasury") {
    const treasury = validateTreasury(out.treasury);
    if (intent.kind === "joinTreasury" && treasury.id !== intent.treasuryId)
      throw new Error("Recovered membership belongs to another treasury.");
    return { clear: true, status: "confirmed", treasury };
  }
  throw new Error("This action needs an explicit recovery policy.");
}
