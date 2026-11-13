import { decodeDrafts, encodeDrafts, type PaymentDraft } from "./drafts.ts";
const key = "accoryn.payment-drafts.v1";
export const readDrafts = (): PaymentDraft[] =>
  decodeDrafts(localStorage.getItem(key));
export const writeDrafts = (drafts: readonly PaymentDraft[]): void =>
  localStorage.setItem(key, encodeDrafts(drafts));
export const clearDrafts = (): void => localStorage.removeItem(key);
export type ProposalRef = {
  draftId: string;
  treasuryId: string;
  proposalId: string;
  contentHash: string;
};
const refsKey = "accoryn.proposal-refs.v1";
export function encodeProposalRefs(refs: readonly ProposalRef[]): string {
  if (
    refs.length > 1000 ||
    new Set(refs.map((r) => r.draftId)).size !== refs.length
  )
    throw new Error("Proposal reference storage requires reconciliation.");
  for (const r of refs)
    if (
      !r ||
      Object.keys(r).sort().join("|") !==
        "contentHash|draftId|proposalId|treasuryId" ||
      Object.values(r).some(
        (v) => typeof v !== "string" || !v || v.length > 200,
      )
    )
      throw new Error("Invalid proposal reference.");
  return JSON.stringify({ version: 1, refs });
}
export function decodeProposalRefs(raw: string | null): ProposalRef[] {
  if (raw === null) return [];
  if (raw.length > 1000000)
    throw new Error("Invalid proposal reference storage.");
  const v = JSON.parse(raw);
  if (
    v?.version !== 1 ||
    Object.keys(v).sort().join("|") !== "refs|version" ||
    !Array.isArray(v.refs)
  )
    throw new Error("Proposal references require reconciliation.");
  encodeProposalRefs(v.refs);
  return structuredClone(v.refs);
}
export const readProposalRefs = (): ProposalRef[] =>
  decodeProposalRefs(localStorage.getItem(refsKey));
export const writeProposalRefs = (refs: readonly ProposalRef[]): void =>
  localStorage.setItem(refsKey, encodeProposalRefs(refs));
export function upsertProposalRef(
  refs: readonly ProposalRef[],
  ref: ProposalRef,
): ProposalRef[] {
  const existing = refs.find((r) => r.draftId === ref.draftId);
  if (
    existing &&
    (existing.proposalId !== ref.proposalId ||
      existing.treasuryId !== ref.treasuryId ||
      existing.contentHash !== ref.contentHash)
  )
    throw new Error(
      "Conflicting proposal reference. Reconcile before continuing.",
    );
  const next = existing ? [...refs] : [...refs, ref];
  encodeProposalRefs(next);
  return next;
}
