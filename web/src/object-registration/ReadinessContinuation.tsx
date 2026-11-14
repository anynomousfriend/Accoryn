import { ActionLink, Button } from "../design/primitives.tsx";
export function ReadinessContinuation({
  confirmedCount,
}: {
  confirmedCount: number;
}) {
  return (
    <section
      className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-7"
      aria-labelledby="next-step-heading"
    >
      <h2 id="next-step-heading" className="font-serif text-2xl text-ink">
        Return to your workspace
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        If you opened help from the workspace, return to that browser tab to
        continue. Member objects are enrolled after opening your vault. The
        standalone research lab below remains available for diagnostics.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <ActionLink href="/treasury/">Open workspace</ActionLink>
        {confirmedCount === 3 ? (
          <ActionLink href="/object-registration/">
            Continue to object registration
          </ActionLink>
        ) : (
          <Button disabled aria-describedby="readiness-next-help">
            Continue to object registration
          </Button>
        )}
        <ActionLink href="/object-registration/" variant="quiet">
          Open registration directly
        </ActionLink>
      </div>
      <p id="readiness-next-help" className="mt-3 text-xs leading-5 text-muted">
        Complete all three checks to continue. Already checked your device? You
        can open registration directly; it only needs the camera.
      </p>
    </section>
  );
}
