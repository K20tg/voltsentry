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
// Phase 2 — the persistent background loops its opening slice seamlessly.
// The incoming copy begins dissolving over the active copy at this timestamp,
// creating a buttery smooth, continuous transition with zero hard cuts or dips.
const AMBIENT_TRIGGER_SEC = 0.95;
const AMBIENT_FADE_MS = 650;
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
 *  loops its opening slice with a layer-over-layer dissolve at {@link AMBIENT_TRIGGER_SEC}.
 *  The incoming video dissolves in smoothly on top while the active video keeps
 *  playing underneath, completely eliminating black blinks, freezes, or hard cuts.
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

  // Seamless ambient loop: layer-over-layer dissolve prevents any brightness dips,
  // freeze-frames, or hard cuts. The incoming copy starts playing from 0s on top
  // while the outgoing copy continues playing underneath. Once the incoming copy
  // reaches 100% opacity, the previous copy is paused and reset in the background.
  useEffect(() => {
    const a = ambientARef.current;
    const b = ambientBRef.current;
    if (!a || !b) return;

    a.style.opacity = "1";
    a.style.zIndex = "2";
    b.style.opacity = "0";
    b.style.zIndex = "1";

    a.currentTime = 0;
    void a.play().catch(() => {});
    b.currentTime = 0;
    b.pause();

    let active = a;
    let idle = b;
    let fading = false;
    let raf = 0;
    let fadeTimer = 0;

    const startFade = () => {
      fading = true;

      // 1. Prime the incoming copy on top
      idle.currentTime = 0;
      idle.style.transition = "none";
      idle.style.opacity = "0";
      idle.style.zIndex = "3";
      // Force DOM reflow so transition starts cleanly from 0
      void idle.offsetWidth;

      void idle.play().catch(() => {});

      // 2. Smoothly dissolve incoming video in over the active video
      idle.style.transition = `opacity ${AMBIENT_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      idle.style.opacity = "1";

      // 3. Once fully opaque, cleanly pause and reset the previously active video
      fadeTimer = window.setTimeout(() => {
        active.pause();
        active.currentTime = 0;
        active.style.transition = "none";
        active.style.opacity = "0";
        active.style.zIndex = "1";

        idle.style.zIndex = "2";

        const previouslyActive = active;
        active = idle;
        idle = previouslyActive;
        fading = false;
      }, AMBIENT_FADE_MS);
    };

    const tick = () => {
      if (!fading && active.currentTime >= AMBIENT_TRIGGER_SEC) {
        startFade();
      }
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
  const ambientVideoClass =
    "absolute inset-0 w-full h-full object-cover scale-[1.07] origin-[45%_45%] contrast-[1.12] brightness-[1.04] saturate-[1.25] [image-rendering:-webkit-optimize-contrast] transform-gpu";

  return (
    <>
      {/* Phase 2 — persistent ambient background (deepest visible layer). */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Tuned crossfading video stack (60% opacity with enhanced dynamic range) */}
        <div className="absolute inset-0 opacity-60">
          <video
            ref={ambientARef}
            className={ambientVideoClass}
            style={{ opacity: 1, zIndex: 2 }}
            src={VIDEO_SRC}
            muted
            playsInline
            preload="auto"
          />
          <video
            ref={ambientBRef}
            className={ambientVideoClass}
            style={{ opacity: 0, zIndex: 1 }}
            src={VIDEO_SRC}
            muted
            playsInline
            preload="auto"
          />
        </div>
        {/* Crisp cyber scanline texture — sharpens perception, removes macroblocking */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.16] mix-blend-overlay"
          style={{
            backgroundImage: "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%)",
            backgroundSize: "100% 3px",
          }}
        />
        {/* Dark gradient tuned for high clarity: preserves vivid video details while keeping NOC text/cards crisp */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-slate-950/50 via-slate-950/30 to-slate-950/75" />
        {/* Bottom mask band — deeper coverage across lower region. */}
        <div className="absolute inset-x-0 bottom-0 h-[22%] pointer-events-none bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent" />
        {/* Bottom-right shadow mask — completely conceals source watermark. */}
        <div className="absolute bottom-0 right-0 w-[42vw] max-w-[500px] h-[34vh] max-h-[280px] pointer-events-none bg-[radial-gradient(ellipse_at_bottom_right,_rgba(2,6,23,1)_0%,_rgba(2,6,23,0.95)_40%,_rgba(2,6,23,0.6)_65%,_transparent_100%)]" />
      </div>

      {/* Phase 1 — full-screen intro splash. */}
      {showIntro && (
        <div
          className={`fixed inset-0 z-50 bg-black overflow-hidden transition-opacity duration-[600ms] ease-out ${
            fading ? "opacity-0" : "opacity-100"
          }`}
        >
          <video
            className="w-full h-full object-cover scale-[1.07] origin-[45%_45%] contrast-[1.10] brightness-[1.03] saturate-[1.18] [image-rendering:-webkit-optimize-contrast] transform-gpu"
            src={VIDEO_SRC}
            autoPlay
            muted
            playsInline
            preload="auto"
            onTimeUpdate={handleIntroTimeUpdate}
            onEnded={dismissIntro}
          />

          {/* Crisp cyber scanline texture — sharpens perception, authentic SCADA HUD look */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.20] mix-blend-overlay"
            style={{
              backgroundImage: "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%)",
              backgroundSize: "100% 3px",
            }}
          />

          {/* Radial edge vignette — focuses visual clarity on central vehicle & shield */}
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_45%,_rgba(0,0,0,0.65)_100%)]" />

          {/* Bottom mask band — deeper coverage across lower region */}
          <div className="absolute inset-x-0 bottom-0 h-[22%] pointer-events-none bg-gradient-to-t from-black via-black/95 to-transparent" />

          {/* Bottom-right shadow mask — completely conceals source watermark */}
          <div className="absolute bottom-0 right-0 w-[42vw] max-w-[500px] h-[34vh] max-h-[280px] pointer-events-none bg-[radial-gradient(ellipse_at_bottom_right,_rgba(0,0,0,1)_0%,_rgba(0,0,0,0.95)_40%,_rgba(0,0,0,0.6)_65%,_transparent_100%)]" />

          {/* Top-left tactical telemetry stamp */}
          <div className="absolute top-6 left-6 z-20 flex items-center gap-2.5 font-mono text-xs text-slate-300 pointer-events-none">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-emerald-500/30 backdrop-blur-md shadow-lg">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-emerald-400 font-bold tracking-wider">VOLTSENTRY</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300 font-medium">SCADA INLINE DEFENSE</span>
            </div>
          </div>

          {/* Bottom-right tactical HUD badge & skip control (covers watermark area) */}
          <div className="absolute bottom-6 right-6 z-20 flex flex-col items-end gap-2.5">
            <button
              onClick={dismissIntro}
              className="group flex items-center gap-2 rounded-full border border-emerald-500/40 bg-slate-950/85 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-emerald-300 backdrop-blur-md transition-all hover:border-emerald-400 hover:bg-emerald-950/50 hover:text-white shadow-[0_0_25px_rgba(16,185,129,0.2)]"
            >
              <span>Skip Intro</span>
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 text-emerald-400" />
            </button>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/90 px-3.5 py-1.5 font-mono text-[11px] text-slate-300 backdrop-blur-md shadow-2xl pointer-events-none">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-emerald-400 font-semibold tracking-wider">OCPP 1.6-J</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400 tracking-wider">AI THREAT SENTRY ACTIVE</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
