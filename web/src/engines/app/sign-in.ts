// Object sign-in policy. A matched scan of the account's personal object starts
// a short signing session for exactly that account. This is a convenience lock
// enforced by this app: the signing key itself stays unencrypted in browser
// storage and cannot be derived from a fuzzy image embedding.
import { isDemoObjectMatch } from "../../object-registration/demo-match.ts";

export const SESSION_MS = 600_000;
const COMPARISON_MS = 120_000;

export type SigningSession =
  | { kind: "setup"; until: number }
  | { kind: "object"; accountId: string; templateId: string; until: number };

/** Lets a browser create a brand-new account (which has no object yet). */
export function setupSession(now = Date.now()): SigningSession {
  return { kind: "setup", until: now + SESSION_MS };
}

export function objectSession(
  accountId: string,
  templateId: string,
  similarity: number,
  comparedAt: number,
  now = Date.now(),
): SigningSession {
  if (!isDemoObjectMatch(similarity))
    throw new Error("Your object did not match. Scan it again to sign in.");
  if (
    !Number.isFinite(comparedAt) ||
    comparedAt > now ||
    now - comparedAt >= COMPARISON_MS
  )
    throw new Error("This scan expired. Scan your object again to sign in.");
  if (!accountId || !templateId)
    throw new Error("Choose your account and its object first.");
  return { kind: "object", accountId, templateId, until: now + SESSION_MS };
}

/** `accountId` is the engine's current account, or null before one is chosen. */
export function sessionAllows(
  session: SigningSession | null,
  accountId: string | null,
  now = Date.now(),
): boolean {
  if (!session || !(session.until > now)) return false;
  if (session.kind === "setup") return accountId === null;
  return accountId === null || accountId === session.accountId;
}
