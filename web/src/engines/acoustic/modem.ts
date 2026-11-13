// Acoustic modem: plays and hears one ceremony challenge frame over sound.
//
// TypeScript port of the Proof-of-vicinity acousticModem.js that was exercised
// on a real phone and laptop. The proven choices are kept: a 48 kHz
// AudioContext created/resumed from a user gesture, the ggwave 0.4.0 WASM
// codec with its default (variable-length) parameters at the context rate,
// raw byte views converted to Float32 PCM for playback and back for decoding,
// microphone processing disabled, and a 1024-sample ScriptProcessorNode
// (AudioWorklet is not used because ScriptProcessor is what worked on iOS
// Safari; it is deprecated but still shipped by every major browser).
//
// Every modem is a disposable instance with its own AudioContext, WASM module,
// ggwave instance, microphone stream and nodes. There is no module-level state.
//
// A frame is the 20-character base64url challenge text produced by
// encodeChallenge(). Decoded text is passed through unvalidated; callers must
// validate it with decodeChallenge() (session.ts does). Hearing a frame is
// communication evidence only, never consent or a proof of distance.
import type { GgwaveFactory, GgwaveModule } from "ggwave";

export const ACOUSTIC_SAMPLE_RATE = 48_000;
export const ACOUSTIC_BLOCK_SIZE = 1024;
export const ACOUSTIC_DEFAULT_VOLUME = 25;
export const ACOUSTIC_FRAME_PATTERN = /^[A-Za-z0-9_-]{20}$/;

// DT_FAST is exposed by the ggwave 0.4.0 enum but its variable-length frames do
// not decode in this build (see tests/acoustic-modem.test.ts), so it is not offered.
export const ACOUSTIC_PROTOCOLS = ["audible-fast", "audible-fastest", "ultrasound-fast"] as const;
export type AcousticProtocol = (typeof ACOUSTIC_PROTOCOLS)[number];

const PROTOCOLS: Record<AcousticProtocol, { name: string; fallback: number }> = {
  "audible-fast": { name: "AUDIBLE_FAST", fallback: 1 },
  "audible-fastest": { name: "AUDIBLE_FASTEST", fallback: 2 },
  "ultrasound-fast": { name: "ULTRASOUND_FAST", fallback: 4 },
};

/** "completed": the whole frame was played. "stopped": stopPlayback(), a newer play() or dispose() ended it. "stalled": output never finished (for example a suspended AudioContext). */
export type PlaybackResult = "completed" | "stopped" | "stalled";

export type AcousticUnsupportedCode =
  | "insecure-context"
  | "audio-unavailable"
  | "microphone-unavailable"
  | "no-microphone";

const UNSUPPORTED_MESSAGES: Record<AcousticUnsupportedCode, string> = {
  "insecure-context": "Sound exchange needs a secure (HTTPS) connection.",
  "audio-unavailable": "This browser cannot play or process sound for the approval exchange.",
  "microphone-unavailable": "This browser does not provide microphone access for the approval exchange.",
  "no-microphone": "No usable microphone was found on this device.",
};

/** The device or page cannot take part in the sound exchange. `message` is safe to show to users. */
export class AcousticUnsupportedError extends Error {
  readonly code: AcousticUnsupportedCode;
  constructor(code: AcousticUnsupportedCode) {
    super(UNSUPPORTED_MESSAGES[code]);
    this.name = "AcousticUnsupportedError";
    this.code = code;
  }
}

/** The user or browser refused microphone access. `message` is safe to show to users. */
export class AcousticPermissionError extends Error {
  constructor() {
    super("Microphone access was not allowed. Allow it in the browser settings and try again.");
    this.name = "AcousticPermissionError";
  }
}

export type AcousticModemDeps = {
  /** Loads the ggwave WASM module. Defaults to a fresh instance of the real package per modem. */
  loadGgwave?: () => Promise<GgwaveModule>;
  /** AudioContext constructor; `null` simulates a browser without Web Audio. */
  AudioContext?: typeof AudioContext | null;
  /** Microphone source; `null` simulates a browser without getUserMedia. */
  mediaDevices?: Pick<MediaDevices, "getUserMedia"> | null;
  isSecureContext?: boolean;
};

export type AcousticModem = {
  /** Creates/resumes audio. Call from a user gesture (tap/click) before play or listen. */
  init(): Promise<void>;
  /** Plays one frame. Rejects for an invalid frame, protocol or volume (1–100). */
  play(frameText: string, protocol?: AcousticProtocol, volume?: number): Promise<PlaybackResult>;
  stopPlayback(): void;
  /** Resolves true once the microphone is live, or false when stopped/disposed first. */
  startListening(onFrame: (text: string) => void, onLevel?: (level: number) => void): Promise<boolean>;
  stopListening(): void;
  /** Synchronous, idempotent and never throws. Releases the microphone, nodes, WASM instance and AudioContext. */
  dispose(): void;
};

const PLAYBACK_GRACE_MS = 2_000;
const RESUME_WAIT_MS = 2_000;

function resolveFactory(imported: unknown): GgwaveFactory {
  let candidate = imported;
  for (let depth = 0; depth < 2 && typeof candidate !== "function"; depth += 1)
    candidate = (candidate as { default?: unknown } | null)?.default;
  if (typeof candidate !== "function") throw new Error("The sound engine could not be loaded.");
  return candidate as GgwaveFactory;
}

/** Loads a new instance of the real ggwave 0.4.0 WASM module (CommonJS factory, `mod.default || mod`). */
export async function loadGgwave(): Promise<GgwaveModule> {
  const factory = resolveFactory(await import("ggwave"));
  // The encode binding printf()s buffer sizes on every call; keep that out of the console.
  return factory({ print: () => {} });
}

function convertTypedArray<T extends ArrayBufferView>(
  source: ArrayBufferView,
  Target: new (buffer: ArrayBuffer) => T,
): T {
  const buffer = new ArrayBuffer(source.byteLength);
  new Uint8Array(buffer).set(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
  return new Target(buffer);
}

/** RMS level of one block, scaled to 0–100 as in the reference meter. */
export function audioLevel(samples: Float32Array): number {
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
  const rms = samples.length > 0 ? Math.sqrt(sum / samples.length) : 0;
  return Math.min(100, Math.round(rms * 400));
}

function swallow(action: () => unknown): void {
  try {
    const result = action();
    if (result && typeof (result as Promise<unknown>).catch === "function")
      (result as Promise<unknown>).catch(() => {});
  } catch {
    // Releasing resources must never throw.
  }
}

function microphoneError(error: unknown): unknown {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return new AcousticPermissionError();
  if (name === "NotFoundError" || name === "OverconstrainedError") return new AcousticUnsupportedError("no-microphone");
  return error;
}

// resume() can stay pending without a user gesture (autoplay policy). Never let
// that hang play/listen: proceed after a bounded wait, and a context that is
// still suspended surfaces as a "stalled" playback or a silent microphone.
function boundedResume(audio: AudioContext): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, RESUME_WAIT_MS);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    try {
      audio.resume().then(done, done);
    } catch {
      done();
    }
  });
}

type Ready = { context: AudioContext; ggwave: GgwaveModule; instance: number };

export function createAcousticModem(deps: AcousticModemDeps = {}): AcousticModem {
  const loader = deps.loadGgwave ?? loadGgwave;
  const decoder = new TextDecoder("utf-8");

  let disposed = false;
  let context: AudioContext | null = null;
  let ggwave: GgwaveModule | null = null;
  let instance: number | null = null;
  let loading: Promise<GgwaveModule> | null = null;

  let playbackGeneration = 0;
  let playback: { source: AudioBufferSourceNode; finish: (result: PlaybackResult) => void } | null = null;

  let listenerGeneration = 0;
  let stream: MediaStream | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;

  function audioConstructor(): typeof AudioContext | null {
    if (deps.AudioContext !== undefined) return deps.AudioContext;
    const scope = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    return scope.AudioContext ?? scope.webkitAudioContext ?? null;
  }

  function microphone(): Pick<MediaDevices, "getUserMedia"> {
    const devices = deps.mediaDevices !== undefined ? deps.mediaDevices : globalThis.navigator?.mediaDevices;
    const secure = deps.isSecureContext ?? (globalThis as { isSecureContext?: boolean }).isSecureContext;
    if (secure === false) throw new AcousticUnsupportedError("insecure-context");
    if (!devices || typeof devices.getUserMedia !== "function")
      throw new AcousticUnsupportedError("microphone-unavailable");
    return devices;
  }

  // Runs synchronously up to its first await so that creation and resume()
  // happen inside the caller's user gesture.
  async function ready(): Promise<Ready | null> {
    if (disposed) return null;
    if (!context) {
      const Constructor = audioConstructor();
      if (!Constructor) throw new AcousticUnsupportedError("audio-unavailable");
      try {
        context = new Constructor({ sampleRate: ACOUSTIC_SAMPLE_RATE });
      } catch {
        // Some browsers refuse a forced rate; ggwave is configured with the actual rate below.
        context = new Constructor();
      }
    }
    const audio = context;
    const resuming = audio.state !== "running" && audio.state !== "closed" ? boundedResume(audio) : null;
    if (!loading)
      loading = loader().catch((error: unknown) => {
        loading = null;
        throw error;
      });
    const [module] = await Promise.all([loading, resuming]);
    if (disposed) return null;
    if (!ggwave) {
      module.disableLog();
      ggwave = module;
    }
    if (instance === null) {
      const parameters = ggwave.getDefaultParameters();
      parameters.sampleRateInp = audio.sampleRate;
      parameters.sampleRateOut = audio.sampleRate;
      const id = ggwave.init(parameters);
      if (!(id >= 0)) throw new Error("The sound engine could not start.");
      instance = id;
    }
    return { context: audio, ggwave, instance };
  }

  function protocolId(module: GgwaveModule, protocol: AcousticProtocol) {
    const table = module.ProtocolId || module.TxProtocolId || {};
    const { name, fallback } = PROTOCOLS[protocol];
    return table[`GGWAVE_PROTOCOL_${name}`] ?? table[`GGWAVE_TX_PROTOCOL_${name}`] ?? fallback;
  }

  function stopPlayback(): void {
    playbackGeneration += 1;
    const active = playback;
    playback = null;
    if (!active) return;
    swallow(() => active.source.stop());
    active.finish("stopped");
  }

  function stopListening(): void {
    listenerGeneration += 1;
    const node = processor;
    processor = null;
    if (node) {
      node.onaudioprocess = null;
      swallow(() => node.disconnect());
    }
    const input = sourceNode;
    sourceNode = null;
    if (input) swallow(() => input.disconnect());
    const live = stream;
    stream = null;
    if (live) for (const track of live.getTracks()) swallow(() => track.stop());
  }

  async function play(
    frameText: string,
    protocol: AcousticProtocol = "audible-fast",
    volume: number = ACOUSTIC_DEFAULT_VOLUME,
  ): Promise<PlaybackResult> {
    if (typeof frameText !== "string" || !ACOUSTIC_FRAME_PATTERN.test(frameText))
      throw new TypeError("The sound frame must be exactly 20 base64url characters.");
    if (typeof protocol !== "string" || !Object.hasOwn(PROTOCOLS, protocol))
      throw new RangeError("Unsupported sound protocol.");
    if (typeof volume !== "number" || !Number.isInteger(volume) || volume < 1 || volume > 100)
      throw new RangeError("Sound volume must be an integer from 1 to 100.");

    stopPlayback();
    const generation = playbackGeneration;
    const prepared = await ready();
    if (!prepared || generation !== playbackGeneration) return "stopped";

    const waveform = prepared.ggwave.encode(prepared.instance, frameText, protocolId(prepared.ggwave, protocol), volume);
    if (!waveform || waveform.byteLength === 0 || waveform.byteLength % 4 !== 0)
      throw new Error("The approval sound could not be generated.");
    const samples = convertTypedArray(waveform, Float32Array);
    const audio = prepared.context;
    const buffer = audio.createBuffer(1, samples.length, audio.sampleRate);
    buffer.getChannelData(0).set(samples);
    const durationMs = (samples.length / audio.sampleRate) * 1000;

    return new Promise<PlaybackResult>((resolve) => {
      const source = audio.createBufferSource();
      let settled = false;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const finish = (result: PlaybackResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        source.onended = null;
        swallow(() => source.disconnect());
        if (playback?.source === source) playback = null;
        resolve(result);
      };
      source.buffer = buffer;
      source.connect(audio.destination);
      source.onended = () => finish(generation === playbackGeneration ? "completed" : "stopped");
      playback = { source, finish };
      try {
        source.start(0);
      } catch (error) {
        finish("stopped");
        throw error;
      }
      watchdog = setTimeout(() => {
        swallow(() => source.stop());
        finish("stalled");
      }, Math.ceil(durationMs) + PLAYBACK_GRACE_MS);
    });
  }

  async function startListening(
    onFrame: (text: string) => void,
    onLevel?: (level: number) => void,
  ): Promise<boolean> {
    stopListening();
    const generation = listenerGeneration;
    if (disposed) return false;
    const devices = microphone();
    const prepared = await ready();
    if (!prepared || generation !== listenerGeneration) return false;
    if (typeof prepared.context.createScriptProcessor !== "function")
      throw new AcousticUnsupportedError("audio-unavailable");

    let live: MediaStream;
    try {
      live = await devices.getUserMedia({
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
      });
    } catch (error) {
      if (generation !== listenerGeneration || disposed) return false;
      throw microphoneError(error);
    }
    if (generation !== listenerGeneration || disposed) {
      for (const track of live.getTracks()) swallow(() => track.stop());
      return false;
    }
    stream = live;

    const { context: audio, ggwave: module, instance: id } = prepared;
    sourceNode = audio.createMediaStreamSource(live);
    processor = audio.createScriptProcessor(ACOUSTIC_BLOCK_SIZE, 1, 1);
    processor.onaudioprocess = (event) => {
      if (generation !== listenerGeneration) return;
      const channel = event.inputBuffer.getChannelData(0);
      if (onLevel) onLevel(audioLevel(channel));
      const result = module.decode(id, convertTypedArray(new Float32Array(channel), Int8Array));
      if (result && result.length > 0) {
        const text = decoder.decode(result).trim();
        if (text && generation === listenerGeneration) onFrame(text);
      }
    };
    sourceNode.connect(processor);
    // Chrome only runs onaudioprocess for a connected node; the output buffer stays silent.
    processor.connect(audio.destination);
    return true;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    swallow(stopPlayback);
    swallow(stopListening);
    const module = ggwave;
    const id = instance;
    ggwave = null;
    instance = null;
    if (module && id !== null) swallow(() => module.free(id));
    const audio = context;
    context = null;
    if (audio) swallow(() => audio.close());
  }

  return {
    async init() {
      const prepared = await ready();
      if (!prepared) throw new Error("This sound session is closed.");
    },
    play,
    stopPlayback,
    startListening,
    stopListening,
    dispose,
  };
}
