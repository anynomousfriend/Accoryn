// Minimal typing for the ggwave 0.4.0 Emscripten build (the package ships no
// types). Only the members the acoustic engine uses are described. Names and
// signatures follow node_modules/ggwave/emscripten.cpp.
declare module "ggwave" {
  /** Emscripten enum value object; `value` is the numeric C enum value. */
  export type GgwaveEnumValue = { readonly value: number };

  export type GgwaveParameters = {
    payloadLength: number;
    sampleRateInp: number;
    sampleRateOut: number;
    sampleRate: number;
    samplesPerFrame: number;
    soundMarkerThreshold: number;
    sampleFormatInp: GgwaveEnumValue;
    sampleFormatOut: GgwaveEnumValue;
    operatingMode: number;
  };

  export type GgwaveModule = {
    ProtocolId?: Readonly<Record<string, GgwaveEnumValue | undefined>>;
    /** Older builds named the enum TxProtocolId. */
    TxProtocolId?: Readonly<Record<string, GgwaveEnumValue | undefined>>;
    getDefaultParameters(): GgwaveParameters;
    /** Returns an instance id, or -1 when no instance slot is available. */
    init(parameters: GgwaveParameters): number;
    free(instance: number): void;
    /** Returns a byte view into WebAssembly memory holding sampleFormatOut PCM. Copy it before the next call. */
    encode(
      instance: number,
      text: string,
      protocol: GgwaveEnumValue | number,
      volume: number,
    ): Int8Array;
    /** Returns a byte view into WebAssembly memory; empty when nothing was decoded. Copy it before the next call. */
    decode(instance: number, samples: Int8Array): Int8Array | null | undefined;
    disableLog(): void;
  };

  export type GgwaveModuleOverrides = {
    print?: (text: string) => void;
    printErr?: (text: string) => void;
  };

  export type GgwaveFactory = (overrides?: GgwaveModuleOverrides) => Promise<GgwaveModule>;

  const factory: GgwaveFactory;
  export default factory;
}
