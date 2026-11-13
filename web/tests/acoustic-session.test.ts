import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeChallenge, generateChallenge } from "../src/engines/ceremony/crypto.ts";
import { AcousticUnsupportedError, createAcousticModem, type AcousticModem } from "../src/engines/acoustic/modem.ts";
import { broadcastChallenge, listenForChallenge, NO_SIGNAL_PEAK_LEVEL } from "../src/engines/acoustic/session.ts";
import { createSimulatedAudio, encodeForeignFrame, noise, until } from "./support/simulated-web-audio.ts";

/** Real ggwave waveform of a frame, captured from a real modem's playback path. */
async function encodedFrame(text: string): Promise<Float32Array> {
  const audio = createSimulatedAudio();
  const modem = createAcousticModem(audio.deps);
  try {
    assert.equal(await modem.play(text), "completed");
    return audio.record.played[0];
  } finally {
    modem.dispose();
  }
}

function listener(options: Parameters<typeof createSimulatedAudio>[0] = {}) {
  const audio = createSimulatedAudio(options);
  const modem = createAcousticModem(audio.deps);
  const listening = () => audio.record.processors.at(-1)?.onaudioprocess != null;
  return { audio, modem, listening };
}

test("software round-trip (not a physical speaker-to-microphone test): broadcast frames decode to the session challenge", async () => {
  const challenge = generateChallenge();
  const text = encodeChallenge(challenge);
  const host = createSimulatedAudio();
  const hostModem = createAcousticModem(host.deps);
  const progress: string[] = [];
  const { audio, modem, listening } = listener();
  try {
    const outcome = await broadcastChallenge({
      modem: hostModem,
      frameText: text,
      intervalMs: 100,
      expiresAt: Date.now() + 700,
      signal: new AbortController().signal,
      onProgress: (message) => progress.push(message),
    });
    assert.equal(outcome, "expired");
    assert.ok(host.record.played.length >= 2, `rounds played: ${host.record.played.length}`);

    const heard = listenForChallenge({
      modem,
      timeoutMs: 5_000,
      signal: new AbortController().signal,
      onProgress: (message) => progress.push(message),
    });
    await until(listening, "listener start");
    audio.feed(host.record.played[1]);
    const result = await heard;
    assert.equal(result.kind, "decoded");
    assert.ok(result.kind === "decoded");
    assert.equal(result.text, text);
    assert.deepEqual(result.challenge, challenge);
    assert.equal(listening(), false, "listening stops after a decode");
    assert.equal(audio.record.tracksStopped, 1);

    assert.ok(progress.length > 0);
    for (const message of progress) {
      assert.ok(!message.includes(text), "progress never reveals the challenge");
      assert.match(message, /^[A-Za-z0-9 ().,'-]+$/, `plain public text: ${message}`);
    }
  } finally {
    hostModem.dispose();
    modem.dispose();
  }
});

test("broadcast stops and returns cancelled when aborted mid-playback", async () => {
  const host = createSimulatedAudio({ playback: "manual" });
  const modem = createAcousticModem(host.deps);
  const controller = new AbortController();
  try {
    const running = broadcastChallenge({
      modem,
      frameText: encodeChallenge(generateChallenge()),
      expiresAt: Date.now() + 60_000,
      signal: controller.signal,
    });
    await until(() => host.record.sources.at(-1)?.started === true, "playback start");
    controller.abort();
    assert.equal(await running, "cancelled");
    assert.equal(host.record.sources.at(-1)!.stopCalls, 1);
  } finally {
    modem.dispose();
  }
});

test("broadcast returns immediately when already aborted or already expired", async () => {
  const host = createSimulatedAudio();
  const modem = createAcousticModem(host.deps);
  const frameText = encodeChallenge(generateChallenge());
  try {
    const aborted = new AbortController();
    aborted.abort();
    assert.equal(await broadcastChallenge({ modem, frameText, expiresAt: Date.now() + 60_000, signal: aborted.signal }), "cancelled");
    assert.equal(
      await broadcastChallenge({ modem, frameText, expiresAt: Date.now() - 1, signal: new AbortController().signal }),
      "expired",
    );
    assert.equal(host.record.played.length, 0);
  } finally {
    modem.dispose();
  }
});

test("broadcast rejects an invalid frame before playing, without echoing it", async () => {
  const host = createSimulatedAudio();
  const modem = createAcousticModem(host.deps);
  try {
    for (const frameText of ["K9X2M4", "A".repeat(21), "AAAAAAAAAAAAAAAAAA+/"]) {
      await assert.rejects(
        broadcastChallenge({ modem, frameText, expiresAt: Date.now() + 60_000, signal: new AbortController().signal }),
        (error: Error) => error instanceof TypeError && !error.message.includes(frameText),
      );
    }
    await assert.rejects(
      broadcastChallenge({
        modem,
        frameText: encodeChallenge(generateChallenge()),
        intervalMs: -1,
        expiresAt: Date.now() + 60_000,
        signal: new AbortController().signal,
      }),
      RangeError,
    );
    assert.equal(host.record.contexts.length, 0);
  } finally {
    modem.dispose();
  }
});

test("broadcast surfaces unsupported audio as a typed rejection", async () => {
  const host = createSimulatedAudio();
  const modem = createAcousticModem({ ...host.deps, AudioContext: null });
  try {
    await assert.rejects(
      broadcastChallenge({
        modem,
        frameText: encodeChallenge(generateChallenge()),
        expiresAt: Date.now() + 60_000,
        signal: new AbortController().signal,
      }),
      AcousticUnsupportedError,
    );
  } finally {
    modem.dispose();
  }
});

test("broadcast ends as cancelled (no busy loop) when the modem is disposed underneath it", async () => {
  const host = createSimulatedAudio({ playback: "manual" });
  const modem = createAcousticModem(host.deps);
  const running = broadcastChallenge({
    modem,
    frameText: encodeChallenge(generateChallenge()),
    expiresAt: Date.now() + 60_000,
    signal: new AbortController().signal,
  });
  await until(() => host.record.sources.at(-1)?.started === true, "playback start");
  modem.dispose();
  assert.equal(await running, "cancelled");
  assert.equal(host.record.played.length, 1);
});

test("listening reports no-signal when the microphone hears only silence", async () => {
  const { audio, modem, listening } = listener();
  try {
    const heard = listenForChallenge({ modem, timeoutMs: 150, signal: new AbortController().signal });
    await until(listening, "listener start");
    audio.feed(new Float32Array(1024 * 20));
    assert.deepEqual(await heard, { kind: "no-signal", peakLevel: 0 });
    assert.equal(listening(), false);
    assert.equal(audio.record.tracksStopped, 1);
  } finally {
    modem.dispose();
  }
});

test("listening reports timeout (not no-signal) when sound was present but nothing decoded", async () => {
  const { audio, modem, listening } = listener();
  try {
    const levels: number[] = [];
    const heard = listenForChallenge({
      modem,
      timeoutMs: 150,
      signal: new AbortController().signal,
      onLevel: (level) => levels.push(level),
    });
    await until(listening, "listener start");
    audio.feed(noise(1024 * 20, 0.1));
    const result = await heard;
    assert.equal(result.kind, "timeout");
    assert.ok(result.kind === "timeout");
    assert.equal(result.framesRejected, 0);
    assert.ok(result.peakLevel >= NO_SIGNAL_PEAK_LEVEL, `peak ${result.peakLevel}`);
    assert.equal(result.peakLevel, Math.max(...levels));
    assert.equal(listening(), false);
  } finally {
    modem.dispose();
  }
});

test("software round-trip (not a physical speaker-to-microphone test): non-challenge transmissions are counted and ignored", async () => {
  const foreign = await encodeForeignFrame("K9X2M4");
  const { audio, modem, listening } = listener();
  try {
    const progress: string[] = [];
    const heard = listenForChallenge({
      modem,
      timeoutMs: 400,
      signal: new AbortController().signal,
      onProgress: (message) => progress.push(message),
    });
    await until(listening, "listener start");
    audio.feed(foreign);
    audio.feed(foreign);
    const result = await heard;
    assert.equal(result.kind, "timeout");
    assert.ok(result.kind === "timeout");
    assert.equal(result.framesRejected, 2);
    assert.ok(result.peakLevel > 0);
    assert.ok(progress.some((message) => /not this approval/.test(message)));
    assert.ok(progress.every((message) => !message.includes("K9X2M4")));
  } finally {
    modem.dispose();
  }
});

test("software round-trip (not a physical speaker-to-microphone test): accept() rejects a stale challenge and listening continues", async () => {
  const stale = encodeChallenge(generateChallenge());
  const current = generateChallenge();
  const currentText = encodeChallenge(current);
  const staleAudio = await encodedFrame(stale);
  const currentAudio = await encodedFrame(currentText);
  const { audio, modem, listening } = listener();
  try {
    const seen: string[] = [];
    const heard = listenForChallenge({
      modem,
      timeoutMs: 5_000,
      signal: new AbortController().signal,
      accept: (challenge, text) => {
        seen.push(text);
        assert.equal(challenge.length, 15);
        return text === currentText;
      },
    });
    await until(listening, "listener start");
    audio.feed(staleAudio);
    assert.equal(listening(), true, "a rejected frame does not stop listening");
    audio.feed(currentAudio);
    const result = await heard;
    assert.deepEqual(seen, [stale, currentText]);
    assert.equal(result.kind, "decoded");
    assert.ok(result.kind === "decoded");
    assert.equal(result.text, currentText);
    assert.deepEqual(result.challenge, current);
  } finally {
    modem.dispose();
  }
});

test("software round-trip (not a physical speaker-to-microphone test): an accept() that throws counts as a rejection", async () => {
  const frame = await encodedFrame(encodeChallenge(generateChallenge()));
  const { audio, modem, listening } = listener();
  try {
    const heard = listenForChallenge({
      modem,
      timeoutMs: 300,
      signal: new AbortController().signal,
      accept: () => {
        throw new Error("verifier unavailable");
      },
    });
    await until(listening, "listener start");
    audio.feed(frame);
    const result = await heard;
    assert.equal(result.kind, "timeout");
    assert.ok(result.kind === "timeout");
    assert.equal(result.framesRejected, 1);
  } finally {
    modem.dispose();
  }
});

test("software round-trip (not a physical speaker-to-microphone test): duplicate frames resolve exactly once", async () => {
  const text = encodeChallenge(generateChallenge());
  const frame = await encodedFrame(text);
  const { audio, modem, listening } = listener();
  try {
    let accepted = 0;
    const heard = listenForChallenge({
      modem,
      timeoutMs: 5_000,
      signal: new AbortController().signal,
      accept: () => {
        accepted += 1;
        return true;
      },
    });
    await until(listening, "listener start");
    const repeated = new Float32Array(frame.length * 2 + 1024 * 16);
    repeated.set(frame, 0);
    repeated.set(frame, frame.length + 1024 * 16);
    const delivered = audio.feed(repeated);
    const result = await heard;
    assert.equal(result.kind, "decoded");
    assert.equal(accepted, 1);
    assert.ok(delivered < Math.ceil(repeated.length / 1024), "the duplicate was never processed after the first decode");
    assert.equal(listening(), false);
  } finally {
    modem.dispose();
  }
});

test("listening is cancelled cleanly during the permission prompt", async () => {
  const { audio, modem } = listener({ permission: "deferred" });
  const controller = new AbortController();
  try {
    const heard = listenForChallenge({ modem, timeoutMs: 5_000, signal: controller.signal });
    await until(() => audio.record.permissionRequests === 1, "permission request");
    controller.abort();
    assert.deepEqual(await heard, { kind: "cancelled" });
    audio.grantPermission();
    await until(() => audio.record.tracksStopped === 1, "late stream release");
    assert.equal(audio.record.processors.length, 0);
  } finally {
    modem.dispose();
  }
});

test("listening is cancelled cleanly while the microphone is open, and never starts when already aborted", async () => {
  const { audio, modem, listening } = listener();
  try {
    const controller = new AbortController();
    const heard = listenForChallenge({ modem, timeoutMs: 5_000, signal: controller.signal });
    await until(listening, "listener start");
    controller.abort();
    assert.deepEqual(await heard, { kind: "cancelled" });
    assert.equal(listening(), false);
    assert.equal(audio.record.tracksStopped, 1);

    const aborted = new AbortController();
    aborted.abort();
    assert.deepEqual(await listenForChallenge({ modem, timeoutMs: 5_000, signal: aborted.signal }), { kind: "cancelled" });
    assert.equal(audio.record.permissionRequests, 1);
  } finally {
    modem.dispose();
  }
});

test("listening reports unsupported and denied microphones as outcomes", async () => {
  const insecure = listener({ isSecureContext: false });
  const insecureModem = createAcousticModem({ ...insecure.audio.deps, mediaDevices: null });
  const denied = listener({ permission: new DOMException("Permission denied", "NotAllowedError") });
  try {
    assert.deepEqual(await listenForChallenge({ modem: insecureModem, timeoutMs: 1_000, signal: new AbortController().signal }), {
      kind: "unsupported",
      reason: "Sound exchange needs a secure (HTTPS) connection.",
    });
    const result = await listenForChallenge({ modem: denied.modem, timeoutMs: 1_000, signal: new AbortController().signal });
    assert.equal(result.kind, "denied");
    assert.ok(result.kind === "denied");
    assert.match(result.reason, /Microphone access was not allowed/);
  } finally {
    insecure.modem.dispose();
    insecureModem.dispose();
    denied.modem.dispose();
  }
});

test("listening stops the microphone even when the modem throws unexpectedly", async () => {
  let stops = 0;
  const failing: Pick<AcousticModem, "startListening" | "stopListening"> = {
    startListening: async () => {
      throw new Error("audio graph failed");
    },
    stopListening: () => {
      stops += 1;
    },
  };
  await assert.rejects(listenForChallenge({ modem: failing, timeoutMs: 1_000, signal: new AbortController().signal }), /audio graph failed/);
  assert.equal(stops, 1);
  await assert.rejects(listenForChallenge({ modem: failing, timeoutMs: 0, signal: new AbortController().signal }), RangeError);
});
