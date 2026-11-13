import type { RefCallback } from "react";
import type { RegistrationSnapshot } from "./types.ts";
import { Button } from "../design/primitives.tsx";
export function CapturePanel({
  state,
  attachVideo,
  onCapture,
  onRetake,
  onAccept,
}: {
  state: RegistrationSnapshot;
  attachVideo: RefCallback<HTMLVideoElement>;
  onCapture: () => void;
  onRetake: () => void;
  onAccept: () => void;
}) {
  const live = ["capture", "requesting"].includes(state.phase);
  return (
    <section
      aria-label="Object capture"
      className="rounded-2xl border border-line bg-white p-4 sm:p-6"
    >
      <h2 className="font-serif text-2xl text-ink">
        {state.mode === "comparison"
          ? "Fresh scan"
          : `View ${Math.min(state.viewIndex + 1, 3)} of 3`}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Fill the square with the object. Keep your hand steady and use even
        light.
      </p>
      <div className="relative mx-auto mt-4 aspect-square w-full max-w-lg overflow-hidden rounded-xl border border-line bg-canvas">
        <video
          ref={attachVideo}
          autoPlay
          muted
          playsInline
          aria-label="Live object camera preview"
          className={`absolute inset-0 size-full object-cover ${live ? "opacity-100" : "opacity-0"}`}
        />
        {state.reviewUrl ? (
          <img
            src={state.reviewUrl}
            alt="Current object view, held in memory only"
            className="absolute inset-0 size-full object-cover"
          />
        ) : !live ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm leading-6 text-muted">
            {state.phase === "processing" || state.phase === "comparing"
              ? "Processing this view locally…"
              : "The camera is off."}
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-xl border-2 border-white/80"
          />
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {state.phase === "capture" && (
          <Button onClick={onCapture}>
            Capture {state.mode === "comparison" ? "fresh scan" : "view"}
          </Button>
        )}
        {state.phase === "review" && state.reviewUrl && (
          <>
            <Button onClick={onAccept}>
              {state.mode === "comparison"
                ? "Compare this scan"
                : "Use this view"}
            </Button>
            <Button variant="secondary" onClick={onRetake}>
              Retake view
            </Button>
          </>
        )}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">
        Only the square crop is processed. A scan or screen image cannot prove
        physical possession.
      </p>
    </section>
  );
}
