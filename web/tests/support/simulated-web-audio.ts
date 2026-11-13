// Simulated Web Audio graph and microphone for the acoustic engine tests.
//
// Only the browser audio plumbing is simulated. Audio content is never
// invented: samples captured from playback come from the real ggwave WASM
// encoder, and samples fed to the microphone path are decoded by the real
// ggwave WASM decoder. This is a software round trip, not a physical
// speaker-to-microphone test.
import type { GgwaveModule } from "ggwave";
import { ACOUSTIC_BLOCK_SIZE, loadGgwave, type AcousticModemDeps } from "../../src/engines/acoustic/modem.ts";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let shared: Promise<GgwaveModule> | null = null;
/** One real WASM module per test file; every modem still owns and frees its own ggwave instance. */
export function sharedGgwave(): Promise<GgwaveModule> {
  shared ??= loadGgwave();
  return shared;
}

export type FakeSource = {
  buffer: unknown;
  onended: (() => void) | null;
  started: boolean;
  stopCalls: number;
  connect(destination: unknown): void;
  disconnect(): void;
  start(when?: number): void;
  stop(): void;
};

export type FakeProcessor = {
  bufferSize: number;
  onaudioprocess: ((event: { inputBuffer: { getChannelData(channel: number): Float32Array } }) => void) | null;
  disconnected: boolean;
  connect(destination: unknown): void;
  disconnect(): void;
};

export type SimulatedAudioOptions = {
  /** "auto": playback ends on the next microtask. "manual": only stop() ends it. "never": ended never fires (suspended output). */
  playback?: "auto" | "manual" | "never";
  /** "grant" resolves immediately; "deferred" waits for grantPermission(); an Error rejects. */
  permission?: "grant" | "deferred" | Error;
  close?: "resolve" | "reject" | "throw";
  isSecureContext?: boolean;
};

export function createSimulatedAudio(options: SimulatedAudioOptions = {}) {
  const record = {
    contexts: [] as { sampleRateOption: number | undefined; closeCalls: number; state: string }[],
    played: [] as Float32Array[],
    sources: [] as FakeSource[],
    processors: [] as FakeProcessor[],
    constraints: [] as MediaStreamConstraints[],
    permissionRequests: 0,
    tracksStopped: 0,
  };
  const pendingPermissions: Deferred<MediaStream>[] = [];

  const makeStream = () =>
    ({
      getTracks: () => [
        {
          stop() {
            record.tracksStopped += 1;
          },
        },
      ],
    }) as unknown as MediaStream;

  class FakeAudioContext {
    sampleRate: number;
    state = "running";
    destination = {};
    private entry: { sampleRateOption: number | undefined; closeCalls: number; state: string };

    constructor(contextOptions?: { sampleRate?: number }) {
      this.sampleRate = contextOptions?.sampleRate ?? 44_100;
      this.entry = { sampleRateOption: contextOptions?.sampleRate, closeCalls: 0, state: "running" };
      record.contexts.push(this.entry);
    }
    async resume() {
      this.state = "running";
    }
    close() {
      this.entry.closeCalls += 1;
      this.state = this.entry.state = "closed";
      if (options.close === "throw") throw new Error("close failed synchronously");
      if (options.close === "reject") return Promise.reject(new Error("close failed"));
      return Promise.resolve();
    }
    createBuffer(_channels: number, length: number, sampleRate: number) {
      const samples = new Float32Array(length);
      record.played.push(samples);
      return { duration: length / sampleRate, length, sampleRate, getChannelData: () => samples };
    }
    createBufferSource() {
      const mode = options.playback ?? "auto";
      let ended = false;
      const source: FakeSource = {
        buffer: null,
        onended: null,
        started: false,
        stopCalls: 0,
        connect() {},
        disconnect() {},
        start() {
          source.started = true;
          if (mode === "auto")
            queueMicrotask(() => {
              if (ended) return;
              ended = true;
              source.onended?.();
            });
        },
        stop() {
          source.stopCalls += 1;
          if (mode === "never" || ended) return;
          // Browsers fire "ended" asynchronously after stop().
          queueMicrotask(() => {
            if (ended) return;
            ended = true;
            source.onended?.();
          });
        },
      };
      record.sources.push(source);
      return source;
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createScriptProcessor(bufferSize: number) {
      const processor: FakeProcessor = {
        bufferSize,
        onaudioprocess: null,
        disconnected: false,
        connect() {},
        disconnect() {
          processor.disconnected = true;
        },
      };
      record.processors.push(processor);
      return processor;
    }
  }

  const mediaDevices = {
    async getUserMedia(constraints: MediaStreamConstraints) {
      record.permissionRequests += 1;
      record.constraints.push(constraints);
      const permission = options.permission ?? "grant";
      if (permission instanceof Error) throw permission;
      if (permission === "deferred") {
        const pending = deferred<MediaStream>();
        pendingPermissions.push(pending);
        return pending.promise;
      }
      return makeStream();
    },
  };

  const deps: AcousticModemDeps = {
    loadGgwave: sharedGgwave,
    AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    mediaDevices,
    isSecureContext: options.isSecureContext ?? true,
  };

  return {
    record,
    deps,
    /** Resolves the oldest pending microphone permission request with a live stream. */
    grantPermission() {
      const pending = pendingPermissions.shift();
      if (!pending) throw new Error("No pending permission request");
      pending.resolve(makeStream());
    },
    /** Delivers samples to the active ScriptProcessorNode in 1024-sample blocks, then trailing silence. Stops when the handler is detached. */
    feed(samples: Float32Array, trailingSilenceBlocks = 16): number {
      const processor = record.processors.at(-1);
      const total = Math.ceil(samples.length / ACOUSTIC_BLOCK_SIZE) + trailingSilenceBlocks;
      let delivered = 0;
      for (let block = 0; block < total; block += 1) {
        const handler = processor?.onaudioprocess;
        if (!handler) break;
        const chunk = new Float32Array(ACOUSTIC_BLOCK_SIZE);
        chunk.set(samples.subarray(block * ACOUSTIC_BLOCK_SIZE, (block + 1) * ACOUSTIC_BLOCK_SIZE));
        handler({ inputBuffer: { getChannelData: () => chunk } });
        delivered += 1;
      }
      return delivered;
    },
  };
}

/** Polls (without timers) until the condition holds. */
export async function until(condition: () => boolean, label: string, attempts = 500): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/**
 * Test-only: encodes arbitrary text with the real ggwave encoder so tests can
 * play genuine non-challenge transmissions (for example another app's
 * six-character code) into the microphone path.
 */
export async function encodeForeignFrame(text: string, protocolKey = "GGWAVE_PROTOCOL_AUDIBLE_FAST"): Promise<Float32Array> {
  const ggwave = await sharedGgwave();
  const parameters = ggwave.getDefaultParameters();
  parameters.sampleRateInp = 48_000;
  parameters.sampleRateOut = 48_000;
  const instance = ggwave.init(parameters);
  if (instance < 0) throw new Error("No ggwave instance available");
  try {
    const protocol = ggwave.ProtocolId?.[protocolKey];
    if (!protocol) throw new Error(`Unknown protocol ${protocolKey}`);
    const bytes = ggwave.encode(instance, text, protocol, 25);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    return new Float32Array(copy.buffer);
  } finally {
    ggwave.free(instance);
  }
}

/** Deterministic broadband noise (no decodable content) at the given peak amplitude. */
export function noise(length: number, amplitude: number, seed = 7): Float32Array {
  const out = new Float32Array(length);
  let state = seed >>> 0;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[index] = ((state / 0xffffffff) * 2 - 1) * amplitude;
  }
  return out;
}
