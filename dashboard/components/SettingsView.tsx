"use client";

import React from "react";
import { Sliders, Volume2, Waves, Network, Radio } from "lucide-react";

interface SettingsViewProps {
  waveOpacity: number;
  setWaveOpacity: (opacity: number) => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (enabled: boolean) => void;
}

export function SettingsView({
  waveOpacity,
  setWaveOpacity,
  voiceEnabled,
  setVoiceEnabled,
}: SettingsViewProps) {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pt-8 pb-16">
      <div className="pb-4 border-b border-white/15">
        <h2 className="text-3xl font-black text-white uppercase tracking-tight">SYSTEM & PROXY SETTINGS</h2>
        <p className="text-xs text-slate-400 font-mono mt-1">Configure Localhost Ports, Detection Thresholds & Audio Synthesis</p>
      </div>

      <div className="space-y-6">
        {/* Section 1: Background Wave Opacity (Fixed at 65%) */}
        <div className="p-6 rounded-3xl glass-panel space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-volt-green/20 text-volt-green border border-volt-green/40">
                <Waves className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">3D Wave Canvas Opacity</h3>
                <p className="text-xs text-slate-400 font-sans">EV-green gradient wave background (#0FFF50, #34D399, #0bcc40, #14B8A6)</p>
              </div>
            </div>
            <span className="font-mono font-bold text-volt-green text-sm px-3 py-1 rounded-xl bg-volt-green/20 border border-volt-green/40">
              65% FIXED
            </span>
          </div>
          <p className="text-xs text-slate-400 font-sans pt-1">
            Background opacity is locked at 65% for optimal visual contrast and dashboard readability.
          </p>
        </div>

        {/* Section 2: ElevenLabs Voice TTS Alerts */}
        <div className="p-6 rounded-3xl glass-panel space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-volt-green/20 text-volt-green border border-volt-green/40">
                <Volume2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">ElevenLabs Voice Threat Announcements</h3>
                <p className="text-xs text-slate-400 font-sans">Real-time voice synthesis announcing Tier-1 & Tier-2 threats</p>
              </div>
            </div>

            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold border transition-all ${
                voiceEnabled
                  ? "bg-volt-green/20 text-volt-green border-volt-green/40"
                  : "bg-slate-900 text-slate-500 border-slate-800"
              }`}
            >
              {voiceEnabled ? "VOICE ENABLED" : "VOICE MUTED"}
            </button>
          </div>
        </div>

        {/* Section 3: Non-Negotiable Port Matrix (CONTEXT.md §4.1) */}
        <div className="p-6 rounded-3xl glass-panel space-y-4 font-mono text-xs">
          <div className="flex items-center space-x-3 pb-3 border-b border-white/10">
            <Network className="w-5 h-5 text-volt-green" />
            <h3 className="text-base font-bold text-white font-sans uppercase">Localhost Port Matrix (Spec Frozen)</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 flex justify-between items-center">
              <span className="text-slate-400">Proxy OCPP Ingress</span>
              <span className="text-white font-bold">ws://localhost:8000</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 flex justify-between items-center">
              <span className="text-slate-400">Dashboard Feed</span>
              <span className="text-volt-green font-bold">ws://localhost:8100</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 flex justify-between items-center">
              <span className="text-slate-400">Mock CSMS Backend</span>
              <span className="text-white font-bold">ws://localhost:9000</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 flex justify-between items-center">
              <span className="text-slate-400">Twin Control Channel</span>
              <span className="text-amber-300 font-bold">ws://localhost:9100</span>
            </div>
          </div>
        </div>

        {/* Section 4: Detection Engine Parameters */}
        <div className="p-6 rounded-3xl glass-panel space-y-4 font-mono text-xs">
          <div className="flex items-center space-x-3 pb-3 border-b border-white/10">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white font-sans uppercase">ML Engine Anomaly Alert Threshold</h3>
          </div>

          <div className="flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-white/10">
            <div>
              <div className="text-white font-bold">IsolationForest Alert Threshold</div>
              <div className="text-slate-400 text-[11px] font-sans mt-0.5">ml_score &gt; 0.65 (IsolationForest n_estimators=100, random_state=42)</div>
            </div>
            <span className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
              0.65 PINNED
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
