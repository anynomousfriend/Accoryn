import type { Comparison } from "./types.ts";
import { isDemoObjectMatch, formatDemoSimilarity } from "./demo-match.ts";
export function ComparisonResult({ comparison }: { comparison: Comparison }) {
  const matched = isDemoObjectMatch(comparison.topTwoMean);
  const score = formatDemoSimilarity(comparison.topTwoMean);
  return (
    <section
      aria-labelledby="comparison-heading"
      className="rounded-2xl border border-line bg-white p-5 sm:p-7"
    >
      <p className="eyebrow-label">Demo object comparison</p>
      <h2
        id="comparison-heading"
        className={`mt-2 font-serif text-3xl ${matched ? "text-success" : "text-danger"}`}
      >
        {matched ? "Match" : "No match"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        {matched
          ? "Similarity is above the 50/100 demo threshold. You can continue."
          : "Similarity did not pass the 50/100 demo threshold. Scan your registered object again."}
      </p>
      <p className="mt-4 text-lg font-semibold tabular-nums">
        Similarity score: {score}
      </p>
      <details className="mt-5">
        <summary className="min-h-12 cursor-pointer py-3 text-sm underline">
          View comparison details
        </summary>
        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {comparison.scores.map((score, i) => (
            <div key={i} className="rounded-xl bg-canvas p-4">
              <dt className="text-xs text-muted">Enrollment view {i + 1}</dt>
              <dd className="mt-2 font-mono text-2xl tabular-nums text-ink">
                {score.toFixed(4)}
              </dd>
            </div>
          ))}
        </dl>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt>Mean of the two highest similarities</dt>
            <dd className="font-mono text-xl tabular-nums text-cobalt-strong">
              {comparison.topTwoMean.toFixed(4)}
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt>Image processing time</dt>
            <dd className="font-mono tabular-nums">
              {Math.round(comparison.inferenceMs)} ms
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-xs leading-5 text-muted">
          Demo rule: the unrounded mean of the two highest cosine similarities
          must exceed 0.50. Scores are not identity probabilities. This
          threshold has not been calibrated to authenticate an individual
          object.
        </p>
      </details>
    </section>
  );
}
