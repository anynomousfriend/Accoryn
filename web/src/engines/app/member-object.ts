// Local UX research policy only. This is not a proof accepted by a contract,
// and cannot prevent a browser key holder using another signing client.
export type ObjectCheckContext = {
  accountId: string;
  vaultId: string;
  proposalId: string;
  contentHash: string;
  sessionId: string;
  sessionExpiresAt: number;
  templateId: string;
  modelRevision: string;
};
export type ObjectCheck = ObjectCheckContext & {
  issuedAt: number;
  expiresAt: number;
};
export function memberTemplateKey(vaultId: string, accountId: string): string {
  for (const id of [vaultId, accountId]) {
    if (id.length > 64 || !/^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/.test(id))
      throw new Error("A testnet vault and member account are required.");
  }
  return "member-v1:" + JSON.stringify([vaultId, accountId]);
}
const fields = [
  "accountId",
  "vaultId",
  "proposalId",
  "contentHash",
  "sessionId",
  "templateId",
  "modelRevision",
] as const;
export function acknowledgeComparison(
  context: ObjectCheckContext,
  now = Date.now(),
): ObjectCheck {
  if (
    !fields.every(
      (k) => typeof context[k] === "string" && context[k].length > 0,
    ) ||
    !Number.isFinite(now) ||
    !Number.isFinite(context.sessionExpiresAt) ||
    context.sessionExpiresAt <= now
  )
    throw new Error(
      "Load an open payment session before acknowledging a fresh comparison.",
    );
  return {
    ...context,
    issuedAt: now,
    expiresAt: Math.min(now + 120_000, context.sessionExpiresAt),
  };
}
export function validObjectCheck(
  check: ObjectCheck | null,
  context: ObjectCheckContext,
  now = Date.now(),
): boolean {
  return (
    !!check &&
    Number.isFinite(now) &&
    now >= check.issuedAt &&
    now < check.expiresAt &&
    now < context.sessionExpiresAt &&
    check.expiresAt <= check.issuedAt + 120_000 &&
    fields.every((k) => !!context[k] && check[k] === context[k])
  );
}
