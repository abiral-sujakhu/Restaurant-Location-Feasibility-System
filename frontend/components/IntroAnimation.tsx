"use client";

import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "feasibility-intro-seen";

const SLIDE_MS = 1600;
const GLOW_DELAY_MS = 500;
const GLOW_MS = 1500;
const CLOSE_DELAY_MS = 350;
const CLOSE_MS = 700;

type Phase = "checking" | "final" | "glow" | "closing" | "done";

export default function IntroAnimation() {
  const [phase, setPhase] = useState<Phase>("checking");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const activeTimers: ReturnType<typeof setTimeout>[] = [];
    timers.current = activeTimers;
    const schedule = (fn: () => void, delay: number) => {
      activeTimers.push(setTimeout(fn, delay));
    };

    // sessionStorage/matchMedia only exist client-side, so this check
    // must happen in an effect rather than during render (SSR-safe).
    const alreadySeen = sessionStorage.getItem(SESSION_KEY);
    if (alreadySeen) {
      // Reading sessionStorage can only happen client-side, so this can't
      // be computed during render (would break SSR) — the effect is required.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("done");
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      setPhase("glow");
      schedule(() => setPhase("closing"), 900);
      schedule(() => setPhase("done"), 900 + 400);
    } else {
      setPhase("final");
      schedule(() => setPhase("glow"), SLIDE_MS + GLOW_DELAY_MS);
      schedule(
        () => setPhase("closing"),
        SLIDE_MS + GLOW_DELAY_MS + GLOW_MS + CLOSE_DELAY_MS,
      );
      schedule(
        () => setPhase("done"),
        SLIDE_MS + GLOW_DELAY_MS + GLOW_MS + CLOSE_DELAY_MS + CLOSE_MS,
      );
    }

    return () => {
      activeTimers.forEach(clearTimeout);
    };
  }, []);

  const skip = () => {
    timers.current.forEach(clearTimeout);
    setPhase("closing");
    setTimeout(() => setPhase("done"), CLOSE_MS);
  };

  if (phase === "checking" || phase === "done") return null;

  return (
    <div
      className={`intro-overlay ${phase === "closing" ? "intro-overlay--closing" : ""}`}
      style={{ transitionDuration: `${CLOSE_MS}ms` }}
      onClick={skip}
      role="button"
      tabIndex={0}
      aria-label="Skip intro animation"
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") skip();
      }}
    >
      <div className="intro-stage">
        <span
          className={`intro-final ${
            phase === "glow" || phase === "closing" ? "intro-final--glow" : ""
          }`}
        >
          <span
            className="intro-final__yogya"
            style={{ animationDuration: `${SLIDE_MS}ms` }}
          >
            योग्य
          </span>
          <span
            className="intro-final__site"
            style={{ animationDuration: `${SLIDE_MS}ms` }}
          >
            Site
          </span>
        </span>
      </div>

      <span className="intro-skip">tap to skip</span>
    </div>
  );
}
