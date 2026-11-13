/** Convenience research handoff only. Neither this record nor image similarity
 * protects the extractable signing keys. Never treat this as authentication. */
export type ResearchGrant = {
  templateId: string;
  issuedAt: number;
  expiresAt: number;
};
export const RESEARCH_HANDOFF = "accoryn.research-handoff.v1";
export function researchGrant(
  templateId: string,
  now = Date.now(),
): ResearchGrant {
  if (!templateId || !Number.isSafeInteger(now))
    throw new Error("Invalid research continuation.");
  return { templateId, issuedAt: now, expiresAt: now + 600_000 };
}
export function validateResearchGrant(
  value: unknown,
  templateId: string,
  now = Date.now(),
): value is ResearchGrant {
  if (!value || typeof value !== "object") return false;
  const v = value as ResearchGrant;
  return (
    v.templateId === templateId &&
    Number.isSafeInteger(v.issuedAt) &&
    v.issuedAt <= now &&
    Number.isSafeInteger(v.expiresAt) &&
    v.expiresAt === v.issuedAt + 600_000 &&
    now < v.expiresAt
  );
}
