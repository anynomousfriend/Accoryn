import { test } from "node:test";
import assert from "node:assert/strict";
import type { GgwaveModule } from "ggwave";
import { decodeChallenge, encodeChallenge, generateChallenge } from "../src/engines/ceremony/crypto.ts";
import {
  ACOUSTIC_BLOCK_SIZE,
  ACOUSTIC_PROTOCOLS,
  ACOUSTIC_SAMPLE_RATE,
  AcousticPermissionError,
  AcousticUnsupportedError,
  createAcousticModem,
  loadGgwave,
} from "../src/engines/acoustic/modem.ts";
import { createSimulatedAudio, deferred, sharedGgwave, until } from "./support/simulated-web-audio.ts";

// Encoded length of one 20-character frame with ggwave 0.4.0 default
// (variable-length) parameters at 48 kHz. Measured by the round-trip test below.
const EXPECTED_SAMPLES = {
  "audible-fast": 100_352,
  "audible-fastest": 66_560,
  "ultrasound-fast": 100_352,
} as const;

test("offers only protocols that survive the real ggwave software round trip", () => {
  assert.deepEqual([...ACOUSTIC_PROTOCOLS], ["audible-fast", "audible-fastest", "ultrasound-fast"]);
  assert.equal(ACOUSTIC_SAMPLE_RATE, 48_000);
  assert.equal(ACOUSTIC_BLOCK_SIZE, 1024);
});

for (const protocol of ACOUSTIC_PROTOCOLS) {
  test(`software round-trip (not a physical speaker-to-microphone test): real ggwave WASM ${protocol} frame of a fresh challenge`, async (t) => {
    const audio = createSimulatedAudio();
    const modem = createAcousticModem(audio.deps);
    try {
      const challenge = generateChallenge();
      const text = encodeChallenge(challenge);
      await modem.init();
      assert.equal(audio.record.contexts.length, 1);
      assert.equal(audio.record.contexts[0].sampleRateOption, 48_000);

      assert.equal(await modem.play(text, protocol), "completed");
      const samples = audio.record.played.at(-1)!;
      const seconds = samples.length / ACOUSTIC_SAMPLE_RATE;
      t.diagnostic(`${protocol}: 20-character frame = ${samples.length} samples = ${seconds.toFixed(3)} s at 48 kHz`);
      assert.equal(samples.length, EXPECTED_SAMPLES[protocol]);
      assert.ok(samples.some((sample) => sample !== 0));
      assert.ok(samples.every(Number.isFinite));
      assert.ok(samples.every((sample) => Math.abs(sample) <= 1));

      const frames: string[] = [];
      let peak = 0;
      assert.equal(
        await modem.startListening(
          (value) => frames.push(value),
          (level) => (peak = Math.max(peak, level)),
        ),
        true,
      );
      assert.deepEqual(audio.record.constraints.at(-1), {
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
      });
      assert.equal(audio.record.processors.at(-1)!.bufferSize, 1024);
      audio.feed(samples);
      assert.deepEqual(frames, [text]);
      assert.deepEqual(decodeChallenge(frames[0]), challenge);
      assert.ok(peak > 0 && peak <= 100, `peak level ${peak}`);

      modem.stopListening();
      assert.equal(audio.record.processors.at(-1)!.onaudioprocess, null);
      assert.equal(audio.record.processors.at(-1)!.disconnected, true);
      assert.equal(audio.record.tracksStopped, 1);
    } finally {
      modem.dispose();
    }
  });
}

test("ggwave 0.4.0 does not round-trip DT_FAST in variable-length mode, so the modem does not offer it", async () => {
  const ggwave = await sharedGgwave();
  const parameters = ggwave.getDefaultParameters();
  parameters.sampleRateInp = parameters.sampleRateOut = 48_000;
  const instance = ggwave.init(parameters);
  try {
    const bytes = ggwave.encode(instance, encodeChallenge(generateChallenge()), ggwave.ProtocolId!.GGWAVE_PROTOCOL_DT_FAST!, 25);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    const samples = new Float32Array(copy.buffer);
    let decoded = 0;
    for (let offset = 0; offset < samples.length + 64 * 1024; offset += 1024) {
      const chunk = new Float32Array(1024);
      chunk.set(samples.subarray(offset, offset + 1024));
      const result = ggwave.decode(instance, new Int8Array(chunk.buffer));
      if (result && result.length > 0) decoded += 1;
    }
    assert.equal(decoded, 0);
  } finally {
    ggwave.free(instance);
  }
});

test("the default loader imports the real ggwave package", async () => {
  const ggwave = await loadGgwave();
  assert.equal(typeof ggwave.encode, "function");
  assert.ok(ggwave.ProtocolId?.GGWAVE_PROTOCOL_AUDIBLE_FAST);
});

test("play rejects anything other than a 20-character base64url frame without echoing it", async () => {
  const audio = createSimulatedAudio();
  const modem = createAcousticModem(audio.deps);
  try {
    for (const frame of ["", "K9X2M4", "A".repeat(19), "A".repeat(21), "AAAAAAAAAAAAAAAAAA+/", "AAAAAAAAAAAAAAAAAAA=", "AAAA AAAAAAAAAAAAAAA"]) {
      await assert.rejects(modem.play(frame), (error: Error) => {
        assert.ok(error instanceof TypeError);
        assert.ok(frame === "" || !error.message.includes(frame));
        return true;
      });
    }
    await assert.rejects(modem.play(42 as unknown as string), TypeError);
    const valid = encodeChallenge(generateChallenge());
    await assert.rejects(modem.play(valid, "dt-fast" as never), RangeError);
    await assert.rejects(modem.play(valid, "audible-fast", 0), RangeError);
    await assert.rejects(modem.play(valid, "audible-fast", 101), RangeError);
    await assert.rejects(modem.play(valid, "audible-fast", Number.NaN), RangeError);
    assert.equal(audio.record.contexts.length, 0, "validation happens before any audio is created");
  } finally {
    modem.dispose();
  }
});

test("stop during the microphone permission request disposes of the late stream", async () => {
  const audio = createSimulatedAudio({ permission: "deferred" });
  const modem = createAcousticModem(audio.deps);
  try {
    const pending = modem.startListening(() => assert.fail("Cancelled listener decoded audio"));
    await until(() => audio.record.permissionRequests === 1, "permission request");
    modem.stopListening();
    audio.grantPermission();
    assert.equal(await pending, false);
    assert.equal(audio.record.tracksStopped, 1);
    assert.equal(audio.record.processors.length, 0);
  } finally {
    modem.dispose();
  }
});

test("dispose during the microphone permission request also releases the late stream", async () => {
  const audio = createSimulatedAudio({ permission: "deferred" });
  const modem = createAcousticModem(audio.deps);
  const pending = modem.startListening(() => assert.fail("Disposed listener decoded audio"));
  await until(() => audio.record.permissionRequests === 1, "permission request");
  modem.dispose();
  audio.grantPermission();
  assert.equal(await pending, false);
  assert.equal(audio.record.tracksStopped, 1);
  assert.equal(audio.record.processors.length, 0);
});

test("stop cancels playback while the WASM module is still loading", async () => {
  const audio = createSimulatedAudio();
  const loading = deferred<GgwaveModule>();
  const modem = createAcousticModem({ ...audio.deps, loadGgwave: () => loading.promise });
  try {
    const pending = modem.play(encodeChallenge(generateChallenge()));
    modem.stopPlayback();
    loading.resolve(await sharedGgwave());
    assert.equal(await pending, "stopped");
    assert.equal(audio.record.played.length, 0);
    assert.equal(audio.record.sources.length, 0);
  } finally {
    modem.dispose();
  }
});

test("stop during active playback stops the source and settles immediately", async () => {
  const audio = createSimulatedAudio({ playback: "manual" });
  const modem = createAcousticModem(audio.deps);
  try {
    const pending = modem.play(encodeChallenge(generateChallenge()));
    await until(() => audio.record.sources.at(-1)?.started === true, "playback start");
    modem.stopPlayback();
    assert.equal(await pending, "stopped");
    assert.equal(audio.record.sources.at(-1)!.stopCalls, 1);
  } finally {
    modem.dispose();
  }
});

test("a new play supersedes the previous one instead of overlapping it", async () => {
  const audio = createSimulatedAudio({ playback: "manual" });
  const modem = createAcousticModem(audio.deps);
  try {
    const first = modem.play(encodeChallenge(generateChallenge()));
    await until(() => audio.record.sources.length === 1 && audio.record.sources[0].started, "first playback");
    const second = modem.play(encodeChallenge(generateChallenge()));
    assert.equal(await first, "stopped");
    await until(() => audio.record.sources.length === 2 && audio.record.sources[1].started, "second playback");
    modem.stopPlayback();
    assert.equal(await second, "stopped");
  } finally {
    modem.dispose();
  }
});

test("playback that never ends (suspended output) settles as stalled", async (t) => {
  const audio = createSimulatedAudio({ playback: "never" });
  const modem = createAcousticModem(audio.deps);
  try {
    await modem.init();
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const pending = modem.play(encodeChallenge(generateChallenge()));
    await until(() => audio.record.sources.at(-1)?.started === true, "playback start");
    t.mock.timers.tick(60_000);
    assert.equal(await pending, "stalled");
  } finally {
    t.mock.timers.reset();
    modem.dispose();
  }
});

test("dispose is synchronous, idempotent, never throws and releases every resource", async () => {
  let freed = 0;
  const audio = createSimulatedAudio({ close: "reject", playback: "manual" });
  const modem = createAcousticModem({
    ...audio.deps,
    loadGgwave: async () => {
      const real = await sharedGgwave();
      return Object.assign(Object.create(real) as GgwaveModule, {
        free(instance: number) {
          freed += 1;
          real.free(instance);
        },
      });
    },
  });
  await modem.init();
  assert.equal(await modem.startListening(() => {}), true);
  const playing = modem.play(encodeChallenge(generateChallenge()));
  await until(() => audio.record.sources.length === 1, "playback start");

  assert.equal(modem.dispose(), undefined);
  modem.dispose();
  modem.dispose();
  assert.equal(await playing, "stopped");
  assert.equal(freed, 1);
  assert.equal(audio.record.tracksStopped, 1);
  assert.equal(audio.record.processors[0].onaudioprocess, null);
  assert.equal(audio.record.contexts[0].closeCalls, 1);

  assert.equal(await modem.play(encodeChallenge(generateChallenge())), "stopped");
  assert.equal(await modem.startListening(() => {}), false);
  await assert.rejects(modem.init(), /closed/);
  assert.equal(audio.record.contexts.length, 1, "no audio is recreated after dispose");
});

test("dispose survives a context whose close throws, and works before any use", () => {
  const audio = createSimulatedAudio({ close: "throw" });
  createAcousticModem(audio.deps).dispose();
  const modem = createAcousticModem(audio.deps);
  void modem.init().catch(() => {});
  assert.doesNotThrow(() => modem.dispose());
  assert.doesNotThrow(() => modem.dispose());
});

test("missing Web Audio support is reported as a typed, public-safe error", async () => {
  const audio = createSimulatedAudio();
  const modem = createAcousticModem({ ...audio.deps, AudioContext: null });
  try {
    await assert.rejects(modem.init(), (error: unknown) => {
      assert.ok(error instanceof AcousticUnsupportedError);
      assert.equal(error.code, "audio-unavailable");
      assert.match(error.message, /browser/);
      return true;
    });
    await assert.rejects(modem.play(encodeChallenge(generateChallenge())), AcousticUnsupportedError);
  } finally {
    modem.dispose();
  }
});

test("an insecure page is reported before any microphone or audio request", async () => {
  const audio = createSimulatedAudio({ isSecureContext: false });
  const modem = createAcousticModem({ ...audio.deps, mediaDevices: null });
  try {
    await assert.rejects(modem.startListening(() => {}), (error: unknown) => {
      assert.ok(error instanceof AcousticUnsupportedError);
      assert.equal(error.code, "insecure-context");
      assert.match(error.message, /HTTPS/);
      return true;
    });
    assert.equal(audio.record.contexts.length, 0);
    assert.equal(audio.record.permissionRequests, 0);
  } finally {
    modem.dispose();
  }
});

test("a secure page without microphone access is reported as unsupported", async () => {
  const audio = createSimulatedAudio();
  const modem = createAcousticModem({ ...audio.deps, mediaDevices: null });
  try {
    await assert.rejects(modem.startListening(() => {}), (error: unknown) => {
      assert.ok(error instanceof AcousticUnsupportedError);
      assert.equal(error.code, "microphone-unavailable");
      return true;
    });
  } finally {
    modem.dispose();
  }
});

test("microphone denial and missing hardware map to typed errors", async () => {
  const denied = createSimulatedAudio({ permission: new DOMException("Permission denied", "NotAllowedError") });
  const deniedModem = createAcousticModem(denied.deps);
  const missing = createSimulatedAudio({ permission: new DOMException("Requested device not found", "NotFoundError") });
  const missingModem = createAcousticModem(missing.deps);
  try {
    await assert.rejects(deniedModem.startListening(() => {}), (error: unknown) => {
      assert.ok(error instanceof AcousticPermissionError);
      assert.match(error.message, /Microphone access was not allowed/);
      return true;
    });
    await assert.rejects(missingModem.startListening(() => {}), (error: unknown) => {
      assert.ok(error instanceof AcousticUnsupportedError);
      assert.equal(error.code, "no-microphone");
      return true;
    });
  } finally {
    deniedModem.dispose();
    missingModem.dispose();
  }
});

test("separate modems own separate audio graphs (no shared module state)", async () => {
  const first = createSimulatedAudio();
  const second = createSimulatedAudio();
  const a = createAcousticModem(first.deps);
  const b = createAcousticModem(second.deps);
  try {
    await a.init();
    await b.init();
    assert.equal(await a.startListening(() => {}), true);
    assert.equal(await b.startListening(() => {}), true);
    a.dispose();
    assert.equal(first.record.tracksStopped, 1);
    assert.equal(second.record.tracksStopped, 0);
    assert.notEqual(second.record.processors[0].onaudioprocess, null);
  } finally {
    a.dispose();
    b.dispose();
  }
});
