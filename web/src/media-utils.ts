export function classifyMediaError(error: unknown): { kind: string; message: string } {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return { kind: 'denied', message: 'Permission was blocked. Allow access in your browser settings, then retry.' };
    case 'NotFoundError':
      return { kind: 'missing', message: 'No device is available. Connect or enable it, then retry.' };
    case 'NotReadableError':
    case 'AbortError':
      return { kind: 'busy', message: 'The device may be in use by another app. Close other apps, then retry.' };
    case 'OverconstrainedError':
      return { kind: 'error', message: 'These device settings are unavailable. Check your settings and retry.' };
    default:
      return { kind: 'error', message: 'The check could not finish. Please try again.' };
  }
}

export function rmsLevel(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) return 0;
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / samples.length));
}
