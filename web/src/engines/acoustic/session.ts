// Protocol-level helpers for the ceremony sound exchange.
//
// broadcastChallenge() repeats one challenge frame until it expires or is
// cancelled. listenForChallenge() waits for a frame that decodes to a
// well-formed challenge (decodeChallenge) and that the caller's accept()
// predicate recognises. Progress messages are plain public text meant to be
// shown verbatim; they never contain the challenge.
//
// A decoded challenge shows only that this device received the sound (or a
// relay/recording of it). It is communication evidence, not consent and not a
// proof of distance; consent is the separate signed attestation.
import { decodeChallenge } from "../ceremony/crypto.ts";
import {
  AcousticPermissionError,
  AcousticUnsupportedError,
  type AcousticModem,
  type AcousticProtocol,
} from "./modem.ts";

/**
 * A listen that times out with a peak microphone level below this value (on
 * the modem's 0–100 RMS scale; 3 ≈ RMS 0.0075) and no rejected frames is
 * reported as "no-signal": the microphone heard little more than its noise
 * floor. This is an initial heuristic and must be calibrated on physical devices.
 */
export const NO_SIGNAL_PEAK_LEVEL = 3;

/** Minimum silence between repeated frames so consecutive frames stay separable. */
export const MIN_BROADCAST_GAP_MS = 250;

const MAX_TIMER_MS = 2_147_483_647;

export type BroadcastOptions = {
  modem: Pick<AcousticModem, "play" | "stopPlayback">;
  frameText: string;
  protocol?: AcousticProtocol;
  volume?: number;
  /** Start-to-start period between repeats (default 3000 ms), never less than MIN_BROADCAST_GAP_MS of silence after a frame. */
  intervalMs?: number;
  /** Epoch milliseconds; playback is cut off at this time. */
  expiresAt: number;
  signal: AbortSignal;
  onProgress?: (message: string) => void;
};

export type ListenOutcome =
  | { kind: "decoded"; text: string; challenge: Uint8Array }
  | { kind: "timeout"; framesRejected: number; peakLevel: number }
  | { kind: "no-signal"; peakLevel: number }
  | { kind: "cancelled" }
  | { kind: "unsupported"; reason: string }
  | { kind: "denied"; reason: string };

export type ListenOptions = {
  modem: Pick<AcousticModem, "startListening" | "stopListening">;
  /** How long to listen once the microphone is live. */
  timeoutMs: number;
  signal: AbortSignal;
  /** Return true only for the challenge this session expects. A throw counts as a rejection. */
  accept?: (challenge: Uint8Array, text: string) => boolean;
  onLevel?: (level: number) => void;
  onProgress?: (message: string) => void;
};

type Gate<T> = { kind: "done"; value: T } | { kind: "cancelled" } | { kind: "expired" };

// Settles with whichever happens first: the work (or delay), abort, or the deadline.
// Always attaches handlers to `work`, so a late rejection is never unhandled.
function race<T>(
  work: Promise<T> | null,
  delayMs: number | null,
  signal: AbortSignal,
  deadline: number | null,
): Promise<Gate<T>> {
  return new Promise<Gate<T>>((resolve, reject) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let settled = false;
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = () => settle(() => resolve({ kind: "cancelled" }));
    work?.then(
      (value) => settle(() => resolve({ kind: "done", value })),
      (error: unknown) => settle(() => reject(error)),
    );
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    if (deadline !== null) {
      // Re-arm when a timer fires early or was clamped, so "expired" always means Date.now() >= deadline.
      const arm = () => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return settle(() => resolve({ kind: "expired" }));
        timers.push(setTimeout(arm, Math.min(remaining, MAX_TIMER_MS)));
      };
      arm();
      if (settled) return;
    }
    if (delayMs !== null)
      timers.push(
        setTimeout(() => settle(() => resolve({ kind: "done", value: undefined as T })), Math.min(delayMs, MAX_TIMER_MS)),
      );
  });
}

export async function broadcastChallenge(options: BroadcastOptions): Promise<"expired" | "cancelled"> {
  const { modem, frameText, protocol, volume, intervalMs = 3_000, expiresAt, signal, onProgress } = options;
  if (decodeChallenge(frameText) === null) throw new TypeError("The approval sound code is not valid.");
  if (typeof intervalMs !== "number" || !Number.isFinite(intervalMs) || intervalMs < 0)
    throw new RangeError("The repeat interval must be a non-negative number of milliseconds.");
  if (typeof expiresAt !== "number" || Number.isNaN(expiresAt))
    throw new RangeError("The expiry time must be a number of epoch milliseconds.");

  const report = (message: string) => onProgress?.(message);
  const end = (outcome: "expired" | "cancelled") => {
    report(outcome === "expired" ? "The approval sound has expired." : "The approval sound was stopped.");
    return outcome;
  };

  let round = 0;
  try {
    if (signal.aborted) return end("cancelled");
    if (Date.now() >= expiresAt) return end("expired");
    for (;;) {
      round += 1;
      report(`Playing the approval sound (round ${round}).`);
      const startedAt = Date.now();
      const played = await race(modem.play(frameText, protocol, volume), null, signal, expiresAt);
      if (played.kind !== "done") return end(played.kind);
      // Stopped outside this loop (stopPlayback/dispose): end instead of replaying.
      if (played.value === "stopped") return end(signal.aborted || Date.now() < expiresAt ? "cancelled" : "expired");
      if (played.value === "stalled")
        report("The device paused sound output. Keep this page open and in front.");
      const pause = Math.max(MIN_BROADCAST_GAP_MS, startedAt + intervalMs - Date.now());
      const waited = await race(null, pause, signal, expiresAt);
      if (waited.kind !== "done") return end(waited.kind);
    }
  } finally {
    modem.stopPlayback();
  }
}

export async function listenForChallenge(options: ListenOptions): Promise<ListenOutcome> {
  const { modem, timeoutMs, signal, accept, onLevel, onProgress } = options;
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new RangeError("The listening timeout must be a positive number of milliseconds.");
  const report = (message: string) => onProgress?.(message);

  let finished = false;
  let framesRejected = 0;
  let peakLevel = 0;
  let deliver!: (result: { text: string; challenge: Uint8Array }) => void;
  const decoded = new Promise<{ text: string; challenge: Uint8Array }>((resolve) => {
    deliver = resolve;
  });

  const onFrame = (text: string) => {
    if (finished) return;
    const challenge = decodeChallenge(text);
    let accepted = false;
    if (challenge) {
      try {
        accepted = accept ? accept(challenge, text) === true : true;
      } catch {
        accepted = false;
      }
    }
    if (!accepted || !challenge) {
      framesRejected += 1;
      report("Heard a sound that is not this approval. Still listening.");
      return;
    }
    finished = true;
    // Release the microphone now, before any further audio block is processed.
    modem.stopListening();
    deliver({ text, challenge });
  };
  const onBlockLevel = (level: number) => {
    if (finished) return;
    if (level > peakLevel) peakLevel = level;
    onLevel?.(level);
  };

  try {
    if (signal.aborted) return { kind: "cancelled" };
    report("Waiting for microphone access.");
    const started = await race(modem.startListening(onFrame, onBlockLevel), null, signal, null);
    if (started.kind !== "done" || !started.value) return { kind: "cancelled" };

    report("Listening for the approval sound.");
    const heard = await race(decoded, null, signal, Date.now() + timeoutMs);
    if (heard.kind === "done") {
      report("Approval sound received.");
      return { kind: "decoded", text: heard.value.text, challenge: heard.value.challenge };
    }
    if (heard.kind === "cancelled") return { kind: "cancelled" };
    finished = true;
    if (framesRejected === 0 && peakLevel < NO_SIGNAL_PEAK_LEVEL) {
      report("No sound reached the microphone.");
      return { kind: "no-signal", peakLevel };
    }
    report("The approval sound was not received in time.");
    return { kind: "timeout", framesRejected, peakLevel };
  } catch (error) {
    if (error instanceof AcousticUnsupportedError) return { kind: "unsupported", reason: error.message };
    if (error instanceof AcousticPermissionError) return { kind: "denied", reason: error.message };
    throw error;
  } finally {
    finished = true;
    modem.stopListening();
  }
}
