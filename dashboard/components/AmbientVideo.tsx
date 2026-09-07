"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

/**
 * Swap this to point at a different clip. Lives in dashboard/public, so the
 * public-relative URL is "/assets/landing-video.mp4".
 */
const VIDEO_SRC = "/assets/landing-video.mp4";

// Phase 1 — dismiss the full-screen intro once the clip reaches this mark.
const INTRO_DISMISS_SEC = 8.0;
// Phase 2 — the persistent background only ever loops its opening slice.
const AMBIENT_LOOP_SEC = 1.0;
// Crossfade window at the loop seam. Two copies of the clip dissolve into each
// other across this many seconds so the loop restart is smooth, not a hard cut.
const AMBIENT_FADE_SEC = 0.35;
// Duration of the intro fade-out before it unmounts (keep in sync with the
// Tailwind `duration-[600ms]` below).
const FADE_MS = 600;

/**
 * Two-phase landing video, fully self-contained.
 *
 *  Phase 1 — a full-screen intro splash (z-50) plays the clip through to
 *  {@link INTRO_DISMISS_SEC}, then fades out over {@link FADE_MS} and unmounts,
 *  revealing the app. A "Skip Intro" control dismisses it immediately.
 *
 *  Phase 2 — the SAME clip runs as a persistent, dimmed background layer that
 *  loops only its first {@link AMBIENT_LOOP_SEC} seconds. Two stacked copies
 *  crossfade at the seam (see {@link AMBIENT_FADE_SEC}) so the restart dissolves
 *  smoothly instead of snapping. A dark gradient on top keeps dashboard cards
 *  and text fully legible.
 *
 * Layering note: the spec called for the background at `-z-20`. A negative
 * z-index would paint *behind* the opaque `bg-slate-950` on <body> and the root
 * container, making the video invisible. So the background sits at `z-0` — the
 * same non-negative layer the existing WaveBackground uses — which keeps it the
 * deepest *visible* layer, still behind all `z-10`+ content.
 */
export function AmbientVideo() {
  const [showIntro, setShowIntro] = useState(true);
  const [fading, setFading] = useState(false);
  const dismissedRef = useRef(false);

  // The two crossfading copies of the ambient background clip.
  const ambientARef = useRef<HTMLVideoElement | null>(null);
  const ambientBRef = useRef<HTMLVideoElement | null>(null);

  const dismissIntro = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setFading(true);
    window.setTimeout(() => setShowIntro(false), FADE_MS);
  };

  // Lock body scroll only while the splash is up, and always restore it so the
  // page (and mobile scrolling) behaves normally the moment the intro ends.
  useEffect(() => {
    if (!showIntro) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [showIntro]);

  // Seamless ambient loop: rather than snapping currentTime back to 0 (a visible
  // jump), the incoming copy restarts from 0 and dissolves in over
  // AMBIENT_FADE_SEC while the outgoing copy fades out — a soft crossfade at the
  // AMBIENT_LOOP_SEC mark. Opacity is driven directly on the elements (via a CSS
  // transition) so React never re-renders on every animation frame.
  useEffect(() => {
    const a = ambientARef.current;
    const b = ambientBRef.current;
    if (!a || !b) return;

    a.style.opacity = "1";
    b.style.opacity = "0";

    let active = a;
    let idle = b;
    let fading = false;
    let raf = 0;
    let fadeTimer = 0;

    const startFade = () => {
      fading = true;
      idle.currentTime = 0;
      void idle.play().catch(() => {});
      active.style.opacity = "0";
      idle.style.opacity = "1";
      fadeTimer = window.setTimeout(() => {
        active.pause();
        const previouslyActive = active;
        active = idle;
        idle = previouslyActive;
        fading = false;
      }, AMBIENT_FADE_SEC * 1000);
    };

    const tick = () => {
      if (!fading && active.currentTime >= AMBIENT_LOOP_SEC) startFade();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fadeTimer);
    };
  }, []);

  const handleIntroTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (e.currentTarget.currentTime >= INTRO_DISMISS_SEC) dismissIntro();
  };

  // Shared props for the two crossfading ambient copies.
  const ambientVideoClass = "absolute inset-0 w-full h-full object-cover";
  const ambientVideoStyle: React.CSSProperties = {
    transitionProperty: "opacity",
    transitionDuration: `${AMBIENT_FADE_SEC}s`,
    transitionTimingFunction: "ease-in-out",
  };

  return (
    <>
      {/* Phase 2 — persistent ambient background (deepest visible layer). */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Dimmed crossfading video stack (both copies share the 60% dim). */}
        <div className="absolute inset-0 opacity-60">
          <video
            ref={ambientARef}
            className={ambientVideoClass}
            style={{ ...ambientVideoStyle, opacity: 1 }}
            src={VIDEO_SRC}
            autoPlay
            muted
            playsInline
            preload="auto"
          />
          <video
            ref={ambientBRef}
            className={ambientVideoClass}
            style={{ ...ambientVideoStyle, opacity: 0 }}
            src={VIDEO_SRC}
            autoPlay
            muted
            playsInline
            preload="auto"
          />
        </div>
        {/* Dark gradient so cards, text and metrics stay 100% crisp. */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-slate-950/70 via-slate-950/45 to-slate-950/85" />
        {/* Bottom mask band — hides any source watermark along the lower edge. */}
        <div className="absolute inset-x-0 bottom-0 h-[14%] pointer-events-none bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent" />
      </div>

      {/* Phase 1 — full-screen intro splash. */}
      {showIntro && (
        <div
          className={`fixed inset-0 z-50 bg-black transition-opacity duration-[600ms] ease-out ${
            fading ? "opacity-0" : "opacity-100"
          }`}
        >
          <video
            className="w-full h-full object-cover"
            src={VIDEO_SRC}
            autoPlay
            muted
            playsInline
            preload="auto"
            onTimeUpdate={handleIntroTimeUpdate}
            onEnded={dismissIntro}
          />

          {/* Bottom mask band — hides any source watermark along the lower edge. */}
          <div className="absolute inset-x-0 bottom-0 h-[16%] pointer-events-none bg-gradient-to-t from-black via-black/90 to-transparent" />

          <button
            onClick={dismissIntro}
            className="group absolute bottom-6 right-6 flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-white/90 backdrop-blur-md transition-all hover:border-white/50 hover:bg-white/20 hover:text-white"
          >
            <span>Skip Intro</span>
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      )}
    </>
  );
}
