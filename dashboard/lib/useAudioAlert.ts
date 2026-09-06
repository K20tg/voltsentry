"use client";

import { useState, useRef, useCallback } from "react";

export function useAudioAlert() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastPlayedRef = useRef<number>(0);

  // User click unlocks the Web Audio Context (bypassing browser autoplay blocking)
  const unlockAudio = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume();
      }
      setIsUnlocked(true);
    } catch (e) {
      console.error("[useAudioAlert] Failed to unlock AudioContext:", e);
    }
  }, []);

  // Play alert chime rate-limited to 1 sound per 10 seconds (10,000 ms)
  const playAlert = useCallback(() => {
    const now = Date.now();
    if (now - lastPlayedRef.current < 10000) {
      console.log("[useAudioAlert] Rate limit active (max 1 alert / 10s). Skipping sound.");
      return;
    }

    lastPlayedRef.current = now;

    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      // Generate dual-tone alarm chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sawtooth";
      osc2.type = "sine";

      // 880Hz (A5) -> 440Hz alert chime drop
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);

      osc2.frequency.setValueAtTime(660, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.4);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);

      osc1.stop(ctx.currentTime + 0.45);
      osc2.stop(ctx.currentTime + 0.45);

      console.log("[useAudioAlert] Alert chime played.");
    } catch (e) {
      console.error("[useAudioAlert] Audio playback failed:", e);
    }
  }, []);

  return {
    isUnlocked,
    unlockAudio,
    playAlert,
  };
}
