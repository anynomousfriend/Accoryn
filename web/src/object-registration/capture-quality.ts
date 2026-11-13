import type { QualityResult } from "./types.ts";
export function centerSquare(videoWidth: number, videoHeight: number) {
  if (
    !Number.isFinite(videoWidth) ||
    !Number.isFinite(videoHeight) ||
    videoWidth <= 0 ||
    videoHeight <= 0
  )
    throw new Error("Camera has no valid frame yet.");
  const size = Math.min(videoWidth, videoHeight);
  return { sx: (videoWidth - size) / 2, sy: (videoHeight - size) / 2, size };
}
/** Heuristics at 256×256 luma resolution; not object detection or liveness. */
export function assessQuality(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): QualityResult {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 3 ||
    height < 3 ||
    data.length !== width * height * 4
  )
    return { ok: false, reason: "invalid" };
  const luma = new Float64Array(width * height);
  let total = 0;
  for (let i = 0; i < luma.length; i++) {
    luma[i] =
      0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    total += luma[i];
  }
  const mean = total / luma.length;
  if (mean < 24) return { ok: false, reason: "dark" };
  if (mean > 235) return { ok: false, reason: "bright" };
  let sum = 0,
    squares = 0,
    count = 0;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        luma[i - 1] +
        luma[i + 1] +
        luma[i - width] +
        luma[i + width] -
        4 * luma[i];
      sum += lap;
      squares += lap * lap;
      count++;
    }
  if (squares / count - (sum / count) ** 2 < 20)
    return { ok: false, reason: "blur" };
  return { ok: true, reason: null };
}
