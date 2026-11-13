import { decodeDrafts, encodeDrafts, type PaymentDraft } from "./drafts.ts";
const key = "accoryn.payment-drafts.v1";
export const readDrafts = (): PaymentDraft[] =>
  decodeDrafts(localStorage.getItem(key));
const writeDrafts = (drafts: readonly PaymentDraft[]): void =>
  localStorage.setItem(key, encodeDrafts(drafts));
export const clearDrafts = (): Promise<void> =>
  withStorageLock(() => localStorage.removeItem(key));
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
const writeProposalRefs = (refs: readonly ProposalRef[]): void =>
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
/** All workspace read/modify/write operations share a native cross-tab mutex. */
export async function withStorageLock<T>(
  work: () => T | Promise<T>,
): Promise<T> {
  if (!globalThis.navigator?.locks)
    throw new Error(
      "This browser cannot safely coordinate local writes. Use a current browser over HTTPS or localhost.",
    );
  return navigator.locks.request("accoryn.workspace.storage.v1", work);
}
export function draftRevision(d: PaymentDraft): string {
  return JSON.stringify([
    d.id,
    d.reference,
    d.treasuryId,
    d.recipient,
    d.purpose,
    d.dueDate,
    d.lines.map((l) => [l.description, l.quantity, l.unitAmount]),
    d.updatedAt,
  ]);
}
export async function saveDraft(
  draft: PaymentDraft,
  expectedRevision: string | null,
): Promise<PaymentDraft[]> {
  return withStorageLock(() => {
    const current = readDrafts();
    const existing = current.find((d) => d.id === draft.id);
    if (
      existing
        ? expectedRevision === null ||
          draftRevision(existing) !== expectedRevision
        : expectedRevision !== null
    )
      throw new Error(
        "This draft changed or was deleted in another tab. Reopen the current draft or create a new one.",
      );
    const next = [draft, ...current.filter((d) => d.id !== draft.id)];
    writeDrafts(next);
    return next;
  });
}
export async function deleteDraft(
  id: string,
  expectedRevision: string | null,
): Promise<PaymentDraft[]> {
  return withStorageLock(() => {
    const current = readDrafts();
    const existing = current.find((d) => d.id === id);
    if (
      existing &&
      (expectedRevision === null ||
        draftRevision(existing) !== expectedRevision)
    )
      throw new Error(
        "This draft changed in another tab. Reopen it before deleting.",
      );
    const next = current.filter((d) => d.id !== id);
    writeDrafts(next);
    return next;
  });
}
export async function rememberProposalReference(
  ref: ProposalRef,
): Promise<ProposalRef[]> {
  return withStorageLock(() => {
    const next = upsertProposalRef(readProposalRefs(), ref);
    writeProposalRefs(next);
    return next;
  });
}
