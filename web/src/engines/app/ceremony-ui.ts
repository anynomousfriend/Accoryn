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

type Receipt = {
  role: "host" | "listener";
  sessionId: string;
  sessionPk: string;
  host: string;
  at: number;
  rounds: number;
};
export type SoundPanelInput = {
  role: "host" | "listener";
  phase: "idle" | "listening" | "playing" | "failed";
  /** Latest progress text from the exchange. */
  progress: string | null;
  error: string | null;
  /** The receipt for the session on screen, if this device completed the exchange. */
  receipt: Receipt | null;
};
export type SoundPanel = {
  tone: "neutral" | "active" | "success" | "danger";
  title: string;
  detail: string;
};

const clock = (at: number) => new Date(at).toLocaleTimeString();
const shortKey = (pk: string) => {
  const body = pk.replace(/^ed25519:/, "");
  return `ed25519:${body.slice(0, 6)}…${body.slice(-5)}`;
};

/** The inline status shown next to Play/Listen, so the result is visible where the member is looking. */
export function soundPanel(i: SoundPanelInput): SoundPanel {
  if (i.phase === "listening")
    return {
      tone: "active",
      title: "Listening, microphone on",
      detail: i.progress ?? "Starting the microphone.",
    };
  if (i.phase === "playing")
    return {
      tone: "active",
      title: "Playing the host sound",
      detail: i.progress ?? "Starting the speaker.",
    };
  if (i.phase === "failed")
    return {
      tone: "danger",
      title: i.role === "host" ? "Host sound did not finish" : "Sound not received",
      detail: i.error ?? "Try again.",
    };
  if (i.receipt?.role === "listener")
    return {
      tone: "success",
      title: "Sound received and verified",
      detail: `At ${clock(i.receipt.at)} this device heard ${i.receipt.host}'s sound. It derives the key of on-chain session ${i.receipt.sessionId} (${shortKey(i.receipt.sessionPk)}), which is why you can now approve below. Hearing the sound is not an approval by itself.`,
    };
  if (i.receipt?.role === "host") {
    const n = i.receipt.rounds;
    return {
      tone: "success",
      title: "Host sound played",
      detail: `At ${clock(i.receipt.at)} this device played the sound for on-chain session ${i.receipt.sessionId}${n > 0 ? ` (${n} ${n === 1 ? "round" : "rounds"} to the end)` : ""}. Partners whose page shows Sound received can approve; you can approve below too.`,
    };
  }
  return i.role === "host"
    ? {
        tone: "neutral",
        title: "Not played yet",
        detail: "Ask partners to tap Listen, then tap Play host sound.",
      }
    : {
        tone: "neutral",
        title: "Not received yet",
        detail: "Tap Listen to host sound, then ask the host to play.",
      };
}

/** Why the approval checkbox is open or closed. */
export function approvalGate(receipt: Receipt | null, sessionOpen: boolean): string {
  if (receipt && sessionOpen)
    return `Unlocked: this device ${receipt.role === "host" ? "played" : "received"} the host sound for on-chain session ${receipt.sessionId} at ${clock(receipt.at)}. Tick the box only if you approve this exact payment.`;
  if (receipt && !sessionOpen)
    return "Locked: the session for that sound has ended. Open a new host session.";
  return "Locked until this device receives the host sound in step 1 (the host: until it plays it).";
}
