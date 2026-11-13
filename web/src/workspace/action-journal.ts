import { withStorageLock } from "./storage.ts";
export type PendingAction = {
  requestId: string;
  kind: string;
  treasuryId: string;
  draftId: string | null;
  proposalId: string | null;
  startedAt: string;
  expected?: {
    recipient: string;
    amountAtomic: string;
    purpose: string;
    contentHash: string | null;
    actor: string | null;
  };
};
const key = "accoryn.pending-action.v1";
function validate(value: unknown): PendingAction {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "Pending action record is incompatible. Reconcile it before submitting again.",
    );
  const p = value as PendingAction;
  const { expected, ...base } = p;
  if (
    Object.keys(base).sort().join("|") !==
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
  if (expected !== undefined) {
    if (
      !expected ||
      typeof expected !== "object" ||
      Object.keys(expected).sort().join("|") !==
        "actor|amountAtomic|contentHash|purpose|recipient"
    )
      throw new Error("Invalid pending payment context.");
    for (const text of [
      expected.recipient,
      expected.amountAtomic,
      expected.purpose,
    ])
      if (typeof text !== "string" || !text || text.length > 500)
        throw new Error("Invalid pending payment context.");
    if (!/^[1-9]\d*$/.test(expected.amountAtomic))
      throw new Error("Invalid pending amount.");
    for (const text of [expected.contentHash, expected.actor])
      if (
        text !== null &&
        (typeof text !== "string" || !text || text.length > 200)
      )
        throw new Error("Invalid pending payment binding.");
  }
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
export async function beginAction(
  value: PendingAction,
  signal?: AbortSignal,
): Promise<void> {
  return withStorageLock(() => {
    if (signal?.aborted)
      throw new DOMException("Canceled before submission.", "AbortError");
    if (readPendingAction())
      throw new Error(
        "Reconcile the previous action before submitting another.",
      );
    localStorage.setItem(key, encodePendingAction(value));
  });
}
export async function finishAction(requestId: string): Promise<void> {
  return withStorageLock(() => {
    const pending = readPendingAction();
    if (!pending) return;
    if (pending.requestId !== requestId)
      throw new Error("Pending action changed. Reconcile before continuing.");
    localStorage.removeItem(key);
  });
}
/** pending refers to the proposal lifecycle; execution itself must reach a terminal outcome. */
export function actionConfirmed(kind: string, status: string): boolean {
  return (
    status !== "unknown" &&
    !(kind === "executeProposal" && status === "pending")
  );
}
