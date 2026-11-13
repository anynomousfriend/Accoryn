export type PendingAction = {
  requestId: string;
  kind: string;
  treasuryId: string;
  draftId: string | null;
  proposalId: string | null;
  startedAt: string;
};
const key = "accoryn.pending-action.v1";
function validate(value: unknown): PendingAction {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "Pending action record is incompatible. Reconcile it before submitting again.",
    );
  const p = value as PendingAction;
  if (
    Object.keys(p).sort().join("|") !==
    ["requestId", "kind", "treasuryId", "draftId", "proposalId", "startedAt"]
      .sort()
      .join("|")
  )
    throw new Error("Invalid pending action fields.");
  for (const text of [p.requestId, p.kind, p.treasuryId, p.startedAt])
    if (typeof text !== "string" || !text || text.length > 200)
      throw new Error("Invalid pending action.");
  for (const text of [p.draftId, p.proposalId])
    if (
      text !== null &&
      (typeof text !== "string" || !text || text.length > 200)
    )
      throw new Error("Invalid pending action reference.");
  if (!Number.isFinite(Date.parse(p.startedAt)))
    throw new Error("Invalid action timestamp.");
  return structuredClone(p);
}
export function encodePendingAction(value: PendingAction): string {
  return JSON.stringify({ version: 1, action: validate(value) });
}
export function decodePendingAction(raw: string | null): PendingAction | null {
  if (raw === null) return null;
  if (raw.length > 10000) throw new Error("Invalid action record.");
  const v = JSON.parse(raw);
  if (v?.version !== 1 || Object.keys(v).sort().join("|") !== "action|version")
    throw new Error("Pending action record is incompatible.");
  return validate(v.action);
}
export function readPendingAction(): PendingAction | null {
  return decodePendingAction(localStorage.getItem(key));
}
export function beginAction(value: PendingAction): void {
  if (readPendingAction())
    throw new Error("Reconcile the previous action before submitting another.");
  localStorage.setItem(key, encodePendingAction(value));
}
export function finishAction(requestId: string): void {
  const pending = readPendingAction();
  if (pending?.requestId !== requestId)
    throw new Error("Pending action changed. Reconcile before continuing.");
  localStorage.removeItem(key);
}
/** pending refers to the proposal lifecycle; execution itself must reach a terminal outcome. */
export function actionConfirmed(kind: string, status: string): boolean {
  return (
    status !== "unknown" &&
    !(kind === "executeProposal" && status === "pending")
  );
}
