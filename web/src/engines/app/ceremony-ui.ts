// Why the sound step is unavailable for this member, in plain words, so the
// Play/Listen buttons never grey out without an explanation.
export type SoundGate = {
  writesEnabled: boolean;
  signedIn: boolean;
  pending: boolean;
  account: string;
  /** Members of the vault, from the loaded vault or the loaded payment. */
  members: readonly string[] | null;
  paymentLoaded: boolean;
  paymentOpen: boolean;
  sessionOpen: boolean;
};

/** Null when this member can take part in the sound exchange now. */
export function soundBlockedReason(g: SoundGate): string | null {
  if (!g.writesEnabled) return "Testnet writes are off in this build.";
  if (!g.signedIn || !g.account)
    return "Your sign-in ended (sessions last 10 minutes). Sign in with your object on the Account page, then come back here.";
  if (g.pending)
    return "Reconcile the pending request at the top of this page first.";
  if (!g.paymentLoaded)
    return "Load this payment above first (Refresh payment and ceremony).";
  if (!g.members?.includes(g.account))
    return `${g.account} is not a member of this vault.`;
  if (!g.paymentOpen) return "This payment is no longer open.";
  if (!g.sessionOpen)
    return "Waiting for the host to open the 5-minute session with Open host session above. This page checks every few seconds.";
  return null;
}
