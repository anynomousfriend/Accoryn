import { useEffect, useRef, useState } from "react";
import { AudioLines, Mic, Square } from "lucide-react";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Button, SiteHeader, StatusBadge } from "../design/primitives.tsx";
import { encodeChallenge, generateChallenge } from "../engines/ceremony/crypto.ts";
import {
  ACOUSTIC_PROTOCOLS,
  AcousticPermissionError,
  AcousticUnsupportedError,
  createAcousticModem,
} from "../engines/acoustic/modem.ts";
import type { AcousticModem, AcousticProtocol } from "../engines/acoustic/modem.ts";
import { broadcastChallenge, listenForChallenge } from "../engines/acoustic/session.ts";

// Lab page: measures whether two devices can exchange a fresh ceremony
// challenge by sound. It does not open sessions, sign or move funds, and a
// successful decode is communication evidence only, never a proximity proof.

const checkCode = (challenge: Uint8Array) => bytesToHex(sha256(challenge)).slice(0, 6).toUpperCase();
const LISTEN_TIMEOUT_MS = 60_000;
const BROADCAST_WINDOW_MS = 120_000;

type Trial = { at: string; protocol: AcousticProtocol; result: string; seconds: string };

function describeError(error: unknown): string {
  if (error instanceof AcousticPermissionError) return "Microphone permission was refused.";
  if (error instanceof AcousticUnsupportedError) return error.message;
  return "Audio could not start on this device.";
}

export default function AcousticCheckPage() {
  const modem = useRef<AcousticModem | null>(null);
  const run = useRef<AbortController | null>(null);
  const [protocol, setProtocol] = useState<AcousticProtocol>("audible-fast");
  const [volume, setVolume] = useState(25);
  const [mode, setMode] = useState<"idle" | "broadcasting" | "listening">("idle");
  const [code, setCode] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [trials, setTrials] = useState<Trial[]>([]);

  useEffect(
    () => () => {
      run.current?.abort();
      modem.current?.dispose();
    },
    [],
  );

  const ensureModem = () => (modem.current ??= createAcousticModem());

  function stop() {
    run.current?.abort();
    run.current = null;
    modem.current?.stopPlayback();
    modem.current?.stopListening();
    setMode("idle");
    setLevel(0);
  }

  async function broadcast() {
    stop();
    setError(null);
    setHeard(null);
    const active = ensureModem();
    const initializing = active.init(); // must start inside the tap on iOS Safari
    const controller = new AbortController();
    run.current = controller;
    const challenge = generateChallenge();
    setCode(checkCode(challenge));
    setMode("broadcasting");
    try {
      await initializing;
      const outcome = await broadcastChallenge({
        modem: active,
        frameText: encodeChallenge(challenge),
        protocol,
        volume,
        expiresAt: Date.now() + BROADCAST_WINDOW_MS,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setProgress(outcome === "expired" ? "Broadcast window ended." : "Broadcast stopped.");
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      if (run.current === controller) setMode("idle");
    }
  }

  async function listen() {
    stop();
    setError(null);
    setCode(null);
    setHeard(null);
    const active = ensureModem();
    const initializing = active.init();
    const controller = new AbortController();
    run.current = controller;
    setMode("listening");
    const started = performance.now();
    try {
      await initializing;
      const outcome = await listenForChallenge({
        modem: active,
        timeoutMs: LISTEN_TIMEOUT_MS,
        signal: controller.signal,
        onLevel: setLevel,
        onProgress: setProgress,
      });
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      let result: string;
      if (outcome.kind === "decoded") {
        setHeard(checkCode(outcome.challenge));
        result = "decoded";
      } else if (outcome.kind === "timeout") {
        result = `timeout (${outcome.framesRejected} rejected, peak ${outcome.peakLevel})`;
      } else if (outcome.kind === "no-signal") {
        result = `no signal (peak ${outcome.peakLevel})`;
      } else if (outcome.kind === "unsupported" || outcome.kind === "denied") {
        result = outcome.kind;
        setError(outcome.reason);
      } else {
        result = "cancelled";
      }
      if (outcome.kind !== "cancelled")
        setTrials((list) => [{ at: new Date().toLocaleTimeString(), protocol, result, seconds }, ...list].slice(0, 30));
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      if (run.current === controller) {
        setMode("idle");
        setLevel(0);
      }
    }
  }

  const decoded = trials.filter((trial) => trial.result === "decoded").length;

  return (
    <>
      <SiteHeader section="Acoustic check (lab)" />
      <main id="main" className="page-shell max-w-5xl py-8 sm:py-12">
        <h1 className="font-serif text-4xl">Can these two devices hear each other?</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Put one device in <strong>Broadcast</strong> and the other in <strong>Listen</strong>, about an arm’s length
          apart. Each broadcast sends a fresh 20-character ceremony challenge using ggwave. Matching check codes on both
          screens mean the challenge arrived intact. This page signs nothing and moves no funds. Hearing a sound shows
          the devices communicated; it does not prove who is in the room.
        </p>

        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <label className="block">
            Sound mode
            <select
              className="ml-2 rounded-lg border border-line bg-transparent px-2 py-1"
              value={protocol}
              disabled={mode !== "idle"}
              onChange={(event) => setProtocol(event.target.value as AcousticProtocol)}
            >
              {ACOUSTIC_PROTOCOLS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Volume
            <select
              className="ml-2 rounded-lg border border-line bg-transparent px-2 py-1"
              value={volume}
              disabled={mode !== "idle"}
              onChange={(event) => setVolume(Number(event.target.value))}
            >
              {[10, 25, 50, 75, 100].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <span className="text-muted">Both devices should use the same sound mode.</span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-line p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl">Broadcast</h2>
              {mode === "broadcasting" && <StatusBadge kind="active">Playing</StatusBadge>}
            </div>
            <p className="mt-2 text-sm text-muted">Repeats every 3 seconds for up to 2 minutes.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={broadcast} disabled={mode === "broadcasting"}>
                <AudioLines size={16} aria-hidden="true" /> Start broadcast
              </Button>
              {mode === "broadcasting" && (
                <Button variant="secondary" onClick={stop}>
                  <Square size={16} aria-hidden="true" /> Stop
                </Button>
              )}
            </div>
            {code && (
              <p className="mt-4 text-sm">
                Check code: <span className="font-mono text-2xl tracking-widest">{code}</span>
              </p>
            )}
          </section>

          <section className="rounded-xl border border-line p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl">Listen</h2>
              {mode === "listening" && <StatusBadge kind="active">Listening</StatusBadge>}
            </div>
            <p className="mt-2 text-sm text-muted">Stops after the first valid challenge or 60 seconds.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={listen} disabled={mode === "listening"}>
                <Mic size={16} aria-hidden="true" /> Start listening
              </Button>
              {mode === "listening" && (
                <Button variant="secondary" onClick={stop}>
                  <Square size={16} aria-hidden="true" /> Stop
                </Button>
              )}
            </div>
            {mode === "listening" && (
              <div className="mt-4" aria-label={`Microphone level ${level} of 100`}>
                <div className="h-2 rounded-full bg-line">
                  <div className="h-2 rounded-full bg-current transition-all" style={{ width: `${level}%` }} />
                </div>
              </div>
            )}
            {heard && (
              <p className="mt-4 text-sm">
                Heard check code: <span className="font-mono text-2xl tracking-widest">{heard}</span>
              </p>
            )}
          </section>
        </div>

        <p className="mt-4 min-h-6 text-sm text-muted" aria-live="polite">
          {progress}
        </p>
        {error && (
          <p className="mt-2 text-sm" role="alert">
            <StatusBadge kind="danger">Needs attention</StatusBadge> {error}
          </p>
        )}

        <section className="mt-8">
          <h2 className="font-serif text-2xl">Listening trials on this device</h2>
          <p className="mt-2 text-sm text-muted">
            {trials.length === 0
              ? "No trials yet."
              : `${decoded} of ${trials.length} decoded. Results stay on this page and are not saved.`}
          </p>
          {trials.length > 0 && (
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-4 font-normal">Time</th>
                  <th className="py-1 pr-4 font-normal">Mode</th>
                  <th className="py-1 pr-4 font-normal">Result</th>
                  <th className="py-1 font-normal">Seconds</th>
                </tr>
              </thead>
              <tbody>
                {trials.map((trial, index) => (
                  <tr key={index} className="border-t border-line">
                    <td className="py-1 pr-4">{trial.at}</td>
                    <td className="py-1 pr-4">{trial.protocol}</td>
                    <td className="py-1 pr-4">{trial.result}</td>
                    <td className="py-1">{trial.seconds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
