import type { Comparison } from "./types.ts";
export function ComparisonResult({ comparison }: { comparison: Comparison }) {
  return (
    <section
      aria-labelledby="comparison-heading"
      className="rounded-2xl border border-line bg-white p-5 sm:p-7"
    >
      <h2 id="comparison-heading" className="font-serif text-3xl text-ink">
        Scan compared
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Research comparison — does not unlock an account.
      </p>
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
        Cosine similarity ranges from −1 to 1. Higher means visually more
        similar; it is not a probability or security confidence. Compare the
        same object and similar objects before drawing conclusions.
      </p>
    </section>
  );
}
