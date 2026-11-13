import { useCallback, useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "./primitives.tsx";

export function SharedFrame({
  interactive = false,
}: {
  interactive?: boolean;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  const stop = useCallback(() => {
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
  }, []);
  const play = useCallback(() => {
    if (
      document.hidden ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      stop();
      return;
    }
    const elements = [left.current, right.current].filter(
      (element): element is HTMLDivElement => element !== null,
    );
    // Read the in-flight presentation before cancelling so repeated replays retarget smoothly.
    const current = elements.map(
      (element) => getComputedStyle(element).transform,
    );
    stop();
    const theme = getComputedStyle(document.documentElement);
    const durationToken = theme.getPropertyValue("--motion-explain").trim();
    const time = durationToken.match(/^(\d*\.?\d+)(ms|s)$/);
    const duration = time
      ? Number(time[1]) * (time[2] === "s" ? 1000 : 1)
      : NaN;
    const easing = theme.getPropertyValue("--ease-in-out").trim();
    if (!Number.isFinite(duration) || duration <= 0 || !easing) return;
    animations.current = elements.flatMap((element, index) => {
      if (!element.animate) return [];
      const from =
        current[index] === "none"
          ? `translateX(${index === 0 ? -12 : 12}px)`
          : current[index];
      return [
        element.animate([{ transform: from }, { transform: "translateX(0)" }], {
          duration,
          easing,
        }),
      ];
    });
  }, [stop]);

  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const onHide = () => {
      if (document.hidden) stop();
    };
    const onPreference = () => {
      if (preference.matches) stop();
    };
    // IntersectionObserver can coalesce a rapid in-view replay followed by an
    // instant scroll back out. Check active playback on scroll as well so that
    // a missed intermediate visibility entry cannot leave it running offscreen.
    const onViewportChange = () => {
      if (!animations.current.length || !scene.current) return;
      const rect = scene.current.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      if (rect.width <= 0 || rect.height <= 0 || width * height / (rect.width * rect.height) < 0.35) stop();
    };
    window.addEventListener("scroll", onViewportChange, { passive: true });
    window.addEventListener("resize", onViewportChange);
    document.addEventListener("visibilitychange", onHide);
    preference.addEventListener("change", onPreference);
    let observer: IntersectionObserver | undefined;
    let hasPlayed = false;
    if (scene.current) {
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries.some(
            (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.35,
          );
          if (!visible) stop();
          else if (!interactive && !hasPlayed) {
            hasPlayed = true;
            play();
          }
        },
        { threshold: 0.35 },
      );
      observer.observe(scene.current);
    }
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
      document.removeEventListener("visibilitychange", onHide);
      preference.removeEventListener("change", onPreference);
      stop();
    };
  }, [interactive, play, stop]);

  return (
    <figure className="m-0">
      <div
        ref={scene}
        className="shared-frame"
        role="img"
        aria-label="Independent frames meeting at a shared center"
      >
        <div className="frame-atmosphere" />
        <div ref={left} data-frame-layer className="frame-layer">
          <img
            src="/assets/experience/frame-cobalt.svg"
            width="440"
            height="380"
            alt=""
          />
        </div>
        <div ref={right} data-frame-layer className="frame-layer">
          <img
            src="/assets/experience/frame-ice.svg"
            width="440"
            height="380"
            alt=""
          />
        </div>
        <span className="frame-center" />
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-3 border-t border-white/20 pt-5 text-sm text-white">
        <span>One proposal. A shared moment.</span>
        {interactive && (
          <Button
            variant="quiet"
            className="frame-replay"
            onClick={(event) => {
              if (event.detail === 0) stop();
              else play();
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Replay illustration
          </Button>
        )}
      </figcaption>
    </figure>
  );
}
