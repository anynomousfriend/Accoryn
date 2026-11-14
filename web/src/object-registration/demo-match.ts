// User-selected demo heuristic. This is not calibrated identity confidence.
export const DEMO_OBJECT_THRESHOLD = 0.5;
export function isDemoObjectMatch(similarity: number): boolean {
  return (
    Number.isFinite(similarity) &&
    similarity > DEMO_OBJECT_THRESHOLD &&
    similarity <= 1
  );
}
export function formatDemoSimilarity(similarity: number): string {
  if (!Number.isFinite(similarity) || similarity < -1 || similarity > 1)
    return "Unavailable";
  const rounded = (similarity * 100).toFixed(2);
  return (
    (isDemoObjectMatch(similarity) && Number(rounded) <= 50 ? ">" : "") +
    rounded +
    " / 100"
  );
}
