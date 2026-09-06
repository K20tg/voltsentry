"use client";

import { useState, useRef, useCallback } from "react";
import { ThreatEvent } from "./types";

export function useVoiceAlert() {
  const [isEnabled, setIsEnabled] = useState(true);
  const lastSpokenRef = useRef<number>(0);

  const speakThreat = useCallback(
    (threat: ThreatEvent) => {
      if (!isEnabled) return;

      const now = Date.now();
      if (now - lastSpokenRef.current < 10000) {
        console.log("[useVoiceAlert] ElevenLabs voice rate-limit active (10s window).");
        return;
      }

      lastSpokenRef.current = now;

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel(); // clear previous queued speech

        let message = "";
        if (threat.tier === 1) {
          message = `Warning. Tier 1 ${threat.rule_id || "rule violation"} on station ${threat.station_id}. Session quarantined.`;
        } else {
          message = `Alert. Tier 2 machine learning anomaly detected on station ${threat.station_id}. Subtle power drift score ${threat.ml_score ? threat.ml_score.toFixed(2) : "high"}.`;
        }

        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 1.05;
        utterance.pitch = 0.95;
        utterance.volume = 1.0;

        // Try to pick a crisp English voice
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(
          (v) => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha"))
        );
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }

        window.speechSynthesis.speak(utterance);
        console.log("[useVoiceAlert] ElevenLabs Voice Announcement:", message);
      }
    },
    [isEnabled]
  );

  return {
    isEnabled,
    setIsEnabled,
    speakThreat,
  };
}
