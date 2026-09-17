"use client";

/**
 * useSecurityAudio — zero-dependency procedural sound for the security gate.
 *
 * Everything is synthesised with the Web Audio API at call time: no .mp3, no
 * .wav, nothing to load or fail to buffer. Three cues:
 *
 *   scan   — short dual-tone beep, on field focus
 *   grant  — ascending 4-note chime, on successful authentication
 *   deny   — low descending square-wave buzz, on rejected input
 *
 * Browsers refuse to start an AudioContext outside a user gesture, so the
 * context is created lazily on the first chirp (which is always triggered by a
 * focus, click or submit) and resumed if the browser suspended it. Every call
 * is wrapped — audio is decoration here, and a failure must never break login.
 */

import { useCallback, useEffect, useRef } from "react";

export type Chirp = "scan" | "grant" | "deny";

type Ctx = AudioContext & { __voltsentry?: true };

export function useSecurityAudio() {
  const ctxRef = useRef<Ctx | null>(null);
  const mutedRef = useRef(false);

  // Release the context on unmount so a nav away doesn't leak an audio device.
  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => {
          /* already torn down */
        });
      }
    };
  }, []);

  const ensureCtx = useCallback((): Ctx | null => {
    if (typeof window === "undefined") return null;
    try {
      if (!ctxRef.current) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AC) return null;
        ctxRef.current = new AC() as Ctx;
      }
      const ctx = ctxRef.current;
      // Autoplay policy parks the context until a gesture unlocks it.
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      return ctx;
    } catch {
      return null;
    }
  }, []);

  /**
   * One enveloped oscillator voice. `at` is an offset in seconds from now, so
   * a caller can sequence notes without timers.
   */
  const voice = useCallback(
    (
      ctx: Ctx,
      opts: {
        type: OscillatorType;
        freq: number;
        endFreq?: number;
        at: number;
        dur: number;
        gain: number;
      }
    ) => {
      const t0 = ctx.currentTime + opts.at;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();

      osc.type = opts.type;
      osc.frequency.setValueAtTime(opts.freq, t0);
      if (opts.endFreq !== undefined) {
        // Linear ramp reads as a "slide"; exponential would need non-zero ends.
        osc.frequency.linearRampToValueAtTime(opts.endFreq, t0 + opts.dur);
      }

      // Short attack + exponential decay — avoids the click a raw gate makes.
      amp.gain.setValueAtTime(0.0001, t0);
      amp.gain.exponentialRampToValueAtTime(opts.gain, t0 + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);

      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + opts.dur + 0.02);
    },
    []
  );

  const playChirp = useCallback(
    (kind: Chirp) => {
      if (mutedRef.current) return;
      const ctx = ensureCtx();
      if (!ctx) return;

      try {
        switch (kind) {
          case "scan": {
            // Dual tone, a beat apart — the "badge read" tick.
            voice(ctx, { type: "sine", freq: 880, at: 0, dur: 0.075, gain: 0.06 });
            voice(ctx, {
              type: "sine",
              freq: 1320,
              at: 0.045,
              dur: 0.075,
              gain: 0.045,
            });
            break;
          }
          case "grant": {
            // Ascending major arpeggio: C5 E5 G5 C6.
            const notes = [523.25, 659.25, 783.99, 1046.5];
            notes.forEach((f, i) => {
              voice(ctx, {
                type: "triangle",
                freq: f,
                at: i * 0.075,
                dur: 0.19,
                gain: 0.075,
              });
            });
            // Shimmer tail on the octave.
            voice(ctx, {
              type: "sine",
              freq: 2093,
              at: 0.3,
              dur: 0.34,
              gain: 0.03,
            });
            break;
          }
          case "deny": {
            // Low square buzz sliding down — unmistakably a rejection.
            voice(ctx, {
              type: "square",
              freq: 148,
              endFreq: 84,
              at: 0,
              dur: 0.3,
              gain: 0.05,
            });
            voice(ctx, {
              type: "square",
              freq: 99,
              endFreq: 62,
              at: 0.09,
              dur: 0.26,
              gain: 0.035,
            });
            break;
          }
        }
      } catch {
        /* synthesis failed — stay silent, never break the gate */
      }
    },
    [ensureCtx, voice]
  );

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
  }, []);

  return { playChirp, setMuted };
}
