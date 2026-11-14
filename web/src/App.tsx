import { ReadinessContinuation } from "./object-registration/ReadinessContinuation.tsx";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  AudioLines,
  Camera,
  Check,
  CheckCheck,
  CircleHelp,
  Layers2,
  LockKeyhole,
  Mic,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { BrandLink } from "./design/primitives.tsx";
import type { LucideIcon } from "lucide-react";
import { DeviceChecks } from "./device-check.ts";
import type { CheckState } from "./device-check.ts";

function Status({ state }: { state: CheckState }) {
  const text = state.confirmed
    ? "Confirmed"
    : state.phase === "active"
      ? "Live"
      : state.phase === "requesting"
        ? "Waiting"
        : ["error", "unsupported"].includes(state.phase)
          ? "Needs attention"
          : state.phase === "played"
            ? "Your turn"
            : "Not checked";
  return (
    <span
      className={`status ${state.confirmed ? "status-done" : ["error", "unsupported"].includes(state.phase) ? "status-error" : state.phase === "active" ? "status-live" : ""}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {text}
    </span>
  );
}

function CardHeading({
  icon: Icon,
  number,
  title,
  subtitle,
  state,
}: {
  icon: LucideIcon;
  number: string;
  title: string;
  subtitle: string;
  state: CheckState;
}) {
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <span className="card-icon">
          <Icon size={21} strokeWidth={1.65} />
        </span>
        <span className="font-mono text-xs text-muted">{number} / 03</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <Status state={state} />
      </div>
      <p className="mb-5 min-h-10 text-sm leading-relaxed text-muted">
        {subtitle}
      </p>
    </>
  );
}

function Detail({ state }: { state: CheckState }) {
  return (
    <p
      role={["error", "unsupported"].includes(state.phase) ? "alert" : "status"}
      className={`my-4 min-h-10 text-xs leading-relaxed ${["error", "unsupported"].includes(state.phase) ? "text-danger" : "text-muted"}`}
    >
      {state.detail}
    </p>
  );
}

export default function App() {
  const [checks] = useState(() => new DeviceChecks());
  const state = useSyncExternalStore(checks.subscribe, checks.getSnapshot);
  const video = useRef<HTMLVideoElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const confirmed = [state.camera, state.microphone, state.speaker].filter(
    (check) => check.confirmed,
  ).length;
  const cameraRunning = ["active", "requesting"].includes(state.camera.phase);
  const micRunning = ["active", "requesting"].includes(state.microphone.phase);
  const speakerRunning = ["active", "requesting"].includes(state.speaker.phase);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden") checks.reset();
    };
    window.addEventListener("pagehide", checks.reset);
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      window.removeEventListener("pagehide", checks.reset);
      document.removeEventListener("visibilitychange", stopWhenHidden);
      checks.reset();
    };
  }, [checks]);

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <nav
          aria-label="Main navigation"
          className="page-shell flex min-h-22 flex-wrap items-center justify-between gap-4 py-3"
        >
          <BrandLink />
          <div className="flex items-center gap-4">
            <a href="/design/" className="nav-link">
              UI reference
            </a>
            <button
              className="icon-button"
              aria-label="Device check help"
              aria-expanded={showHelp}
              onClick={() => setShowHelp(!showHelp)}
            >
              {showHelp ? <X size={19} /> : <CircleHelp size={19} />}
            </button>
          </div>
        </nav>
      </header>

      <main
        id="main"
        className="mx-auto max-w-[1312px] px-5 pb-12 pt-9 sm:px-8 sm:pt-14"
      >
        <div className="mb-9 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="text-cobalt-strong">Getting started</span>
          <span>/</span>
          <span>Device readiness</span>
        </div>
        <div className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="eyebrow mb-4">A good start, together.</div>
            <h1 className="font-serif text-[2.75rem] leading-[1.1] tracking-[-0.035em] sm:text-6xl">
              Check your device<span className="text-cobalt">.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted">
              A quick check of the essentials. Make sure you can see, hear, and
              be heard before your first shared approval.
            </p>
          </div>
          <div className="flex items-center gap-3 self-start rounded-full border border-line bg-surface px-4 py-2.5 lg:self-auto">
            <span
              className={`flex size-7 items-center justify-center rounded-full ${confirmed === 3 ? "bg-cobalt-strong text-canvas" : "bg-sky text-muted"}`}
            >
              <CheckCheck size={15} />
            </span>
            <span className="text-xs font-medium tabular-nums">
              {confirmed} of 3 checks confirmed
            </span>
          </div>
        </div>

        {showHelp && (
          <aside className="mb-6 rounded-2xl border border-line bg-surface p-5 text-sm leading-7 text-muted">
            <strong className="text-ink">A few things to know.</strong> Use
            HTTPS or localhost, allow camera and microphone when you choose to
            start, and use your device speakers. If a permission is blocked,
            change it in your browser's site settings and retry. Switching away
            from this page resets the checks and releases access. This checks
            hardware access; it does not recognize an object or prove proximity.
          </aside>
        )}

        <section
          aria-label="Device checks"
          className="grid items-stretch gap-4 lg:grid-cols-3"
        >
          <article aria-label="Camera check" className="check-card">
            <CardHeading
              icon={Camera}
              number="01"
              title="Camera"
              subtitle="A clear view of the things that matter."
              state={state.camera}
            />
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-line bg-canvas">
              <video
                ref={video}
                muted
                playsInline
                aria-label="Live camera preview"
                className={`size-full object-cover ${state.camera.phase === "active" ? "" : "invisible"}`}
              />
              {state.camera.phase !== "active" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
                  <div className="camera-frame">
                    <Camera size={25} strokeWidth={1.2} />
                  </div>
                  <span className="text-xs">Your preview appears here</span>
                </div>
              )}
              {state.camera.phase === "active" && (
                <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 font-mono text-xs tracking-wider text-white">
                  LIVE · CAMERA ON
                </span>
              )}
            </div>
            <Detail state={state.camera} />
            <div className="mt-auto flex flex-wrap gap-2">
              {cameraRunning ? (
                <>
                  <button
                    className="primary-button flex-1"
                    disabled={state.camera.phase !== "active"}
                    onClick={() => checks.captureFrame()}
                  >
                    <Camera size={15} />
                    Capture frame
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => checks.stopCamera()}
                    aria-label="Stop camera"
                  >
                    <Square size={14} />
                    Stop
                  </button>
                </>
              ) : (
                <button
                  className="primary-button w-full"
                  onClick={() => {
                    if (video.current) void checks.startCamera(video.current);
                  }}
                >
                  <Camera size={15} />
                  {["error", "unsupported"].includes(state.camera.phase)
                    ? "Retry camera"
                    : "Start camera"}
                  <ArrowRight size={14} className="ml-auto" />
                </button>
              )}
            </div>
            {state.capture && (
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-canvas p-2">
                <img
                  src={state.capture}
                  alt="Your captured camera frame, kept in memory only"
                  className="size-14 rounded-lg object-cover"
                />
                <span className="flex-1 text-xs text-muted">
                  Frame captured.
                  <br />
                  Nothing uploaded.
                </span>
                <button
                  className="icon-button"
                  aria-label="Discard captured frame"
                  onClick={() => checks.clearCapture()}
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </article>

          <article aria-label="Microphone check" className="check-card">
            <CardHeading
              icon={Mic}
              number="02"
              title="Microphone"
              subtitle="Make sure your device can pick up sound."
              state={state.microphone}
            />
            <div className="flex aspect-[16/10] flex-col items-center justify-center rounded-xl border border-line bg-canvas px-7">
              <Mic
                size={28}
                strokeWidth={1.25}
                className={micRunning ? "text-cobalt" : "text-muted"}
              />
              <div
                role="meter"
                aria-label="Microphone input level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(state.level * 100)}
                className="my-6 h-3 w-full overflow-hidden rounded-full bg-line/70"
              >
                <div
                  className="h-full w-full origin-left rounded-full bg-cobalt"
                  style={{
                    transform: `scaleX(${Math.min(1, state.level * 5)})`,
                  }}
                />
              </div>
              <span className="text-xs text-muted">
                {state.microphone.phase === "active"
                  ? "Measured live input"
                  : "Waiting for microphone access"}
              </span>
            </div>
            <Detail state={state.microphone} />
            {micRunning ? (
              <button
                className="secondary-button mt-auto w-full"
                onClick={() => checks.stopMicrophone()}
              >
                <Square size={14} />
                Stop microphone
              </button>
            ) : (
              <button
                className="primary-button mt-auto w-full"
                onClick={() => void checks.startMicrophone()}
              >
                <Mic size={15} />
                {["error", "unsupported"].includes(state.microphone.phase)
                  ? "Retry microphone"
                  : "Start microphone"}
                <ArrowRight size={14} className="ml-auto" />
              </button>
            )}
          </article>

          <article aria-label="Speaker check" className="check-card">
            <CardHeading
              icon={Volume2}
              number="03"
              title="Speaker"
              subtitle="A little sound, so you know you're ready."
              state={state.speaker}
            />
            <div className="flex aspect-[16/10] flex-col items-center justify-center gap-5 rounded-xl border border-line bg-canvas">
              <div className="relative flex size-20 items-center justify-center rounded-full border border-line">
                <div className="absolute inset-2 rounded-full border border-line" />
                <Volume2
                  size={29}
                  strokeWidth={1.3}
                  className={speakerRunning ? "text-cobalt" : "text-muted"}
                />
              </div>
              <span className="text-xs text-muted">
                Short audible tone · 660 Hz
              </span>
            </div>
            <Detail state={state.speaker} />
            {state.speaker.phase === "played" ? (
              <div className="mt-auto flex flex-wrap gap-2">
                <button
                  className="primary-button flex-1"
                  onClick={() => checks.confirmSpeaker()}
                >
                  <Check size={15} />I heard the tone
                </button>
                <button
                  className="secondary-button"
                  aria-label="Play tone again"
                  onClick={() => void checks.playTone()}
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            ) : (
              <button
                className="primary-button mt-auto w-full"
                disabled={speakerRunning}
                onClick={() => void checks.playTone()}
              >
                <Volume2 size={15} />
                {speakerRunning
                  ? "Playing tone…"
                  : state.speaker.confirmed
                    ? "Play tone again"
                    : "Play test tone"}
                <ArrowRight size={14} className="ml-auto" />
              </button>
            )}
          </article>
        </section>

        <div className="mt-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <p className="flex items-center gap-2 text-xs text-muted">
            <LockKeyhole size={13} />
            Live inputs stay on this device. Nothing is uploaded or saved.
          </p>
          <button className="text-button self-start" onClick={checks.reset}>
            <RefreshCcw size={13} />
            Reset checks
          </button>
        </div>

        <ReadinessContinuation confirmedCount={confirmed} />

        <section className="mt-10 grid overflow-hidden rounded-2xl border border-ink/10 bg-sky md:grid-cols-[1.1fr_1fr]">
          <div className="p-6 sm:p-8">
            <span className="eyebrow text-muted">Built on the essentials</span>
            <h2 className="mt-3 font-serif text-2xl tracking-tight text-ink">
              Just your device. And your people.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted">
              No extra hardware. No location tracking. A familiar way to get
              your team ready for shared decisions.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-5 border-t border-ink/10 p-6 sm:p-8 md:border-l md:border-t-0">
            <div className="flex gap-3">
              <ShieldCheck size={19} className="shrink-0 text-cobalt" />
              <p className="text-xs leading-5 text-muted">
                <strong className="block font-medium text-ink">
                  You're in control
                </strong>
                Access begins when you start a check. Stop anytime, or switch
                away to release access.
              </p>
            </div>
            <div className="flex gap-3">
              <Layers2 size={19} className="shrink-0 text-cobalt" />
              <p className="text-xs leading-5 text-muted">
                <strong className="block font-medium text-ink">
                  One step at a time
                </strong>
                Continue into local object registration and scan comparison.
                Then continue to the connected testnet treasury.
              </p>
            </div>
          </div>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-xs text-muted">
          <span className="flex items-center gap-2">
            <AudioLines size={14} />
            Built for a shared moment of approval.
          </span>
          <span className="flex items-center gap-2 font-mono">
            FEATURE 01 <ArrowDownLeft size={12} /> DEVICE READINESS
          </span>
        </footer>
      </main>
    </div>
  );
}
