import {
  AutoModel,
  AutoProcessor,
  RawImage,
  env,
} from "@huggingface/transformers";
import manifest from "./model-manifest.json";
import { normalizeEmbedding } from "./comparison.ts";
const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (value: unknown) => void;
};
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
env.backends.onnx.wasm!.wasmPaths = {
  mjs: new URL(
    `/runtime/${manifest.runtime.version}/ort-wasm-simd-threaded.mjs`,
    self.location.origin,
  ).href,
  wasm: new URL(
    `/runtime/${manifest.runtime.version}/ort-wasm-simd-threaded.wasm`,
    self.location.origin,
  ).href,
};
let model: Awaited<ReturnType<typeof AutoModel.from_pretrained>> | null = null;
let processor: Awaited<
  ReturnType<typeof AutoProcessor.from_pretrained>
> | null = null;
scope.onmessage = async ({ data }) => {
  const { id, type, bitmap } = data as {
    id: number;
    type: "load" | "embed";
    bitmap?: ImageBitmap;
  };
  try {
    if (type === "load") {
      const progress_callback = (event: any) => {
        if (event.status === "progress")
          scope.postMessage({
            id,
            type: "progress",
            loaded: event.loaded ?? 0,
            total: event.total ?? null,
          });
      };
      processor = await AutoProcessor.from_pretrained(manifest.modelDirectory, {
        local_files_only: true,
      });
      model = await AutoModel.from_pretrained(manifest.modelDirectory, {
        device: "wasm",
        dtype: "q8",
        local_files_only: true,
        progress_callback,
      });
      scope.postMessage({ id, type: "ready", value: manifest.identity });
    } else {
      if (!model || !processor || !bitmap)
        throw new Error("Load the image model before scanning.");
      const started = performance.now();
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Image processing is unavailable in this browser.");
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
      const inputs = await processor(
        new RawImage(pixels.data, bitmap.width, bitmap.height, 4),
      );
      const output = await model(inputs);
      const hidden = output.last_hidden_state;
      if (
        !hidden ||
        hidden.dims[0] !== 1 ||
        hidden.dims[hidden.dims.length - 1] !== 384
      )
        throw new Error("Unexpected model output.");
      const vector = normalizeEmbedding(
        Array.from(hidden.data.slice(0, 384)) as number[],
      );
      scope.postMessage({
        id,
        type: "result",
        value: {
          vector,
          inferenceMs: performance.now() - started,
          model: manifest.identity,
        },
      });
    }
  } catch (error) {
    scope.postMessage({
      id,
      type: "error",
      message:
        type === "load"
          ? "Could not load the local image model. Check the download and retry."
          : error instanceof Error
            ? error.message
            : "Image processing failed.",
    });
  } finally {
    bitmap?.close();
  }
};
