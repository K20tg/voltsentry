"use client";

import React from "react";
import { Sliders, Volume2, Waves, Network } from "lucide-react";

interface SettingsViewProps {
  waveOpacity: number;
  setWaveOpacity: (opacity: number) => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (enabled: boolean) => void;
}

export function SettingsView({
  voiceEnabled,
  setVoiceEnabled,
}: SettingsViewProps) {
  return (
    <div className="max-w-4xl mx-auto space-y-6 pt-8 pb-16">
      <div className="pb-3 border-b border-volt-line">
        <h2 className="text-xl font-bold text-slate-100 tracking-tight">System &amp; Proxy Settings</h2>
        <p className="text-xs text-volt-muted mt-1">
          Ports, detection thresholds and audio alerts.
        </p>
      </div>

      <div className="space-y-3">
        {/* Background canvas opacity */}
        <div className="p-4 rounded-lg glass-panel">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-volt-elevated text-slate-300 border border-volt-line">
                <Waves className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Background Canvas Opacity</h3>
                <p className="text-xs text-volt-muted mt-0.5">Ambient gradient wave layer behind the console.</p>
              </div>
            </div>
            <span className="font-mono text-xs font-medium text-slate-300 px-2 py-1 rounded bg-volt-elevated border border-volt-line">
              65% fixed
            </span>
          </div>
        </div>

        {/* Audio alerts */}
        <div className="p-4 rounded-lg glass-panel">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-volt-elevated text-slate-300 border border-volt-line">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Audio Alerts (Text-to-Speech)</h3>
                <p className="text-xs text-volt-muted mt-0.5">Spoken announcement on Tier-1 and Tier-2 threats.</p>
              </div>
            </div>
            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                voiceEnabled
                  ? "bg-state-healthy/15 text-emerald-300 border-emerald-500/40"
                  : "bg-volt-elevated text-volt-muted border-volt-line"
              }`}
            >
              {voiceEnabled ? "Enabled" : "Muted"}
            </button>
          </div>
        </div>

        {/* Port matrix */}
        <div className="p-4 rounded-lg glass-panel space-y-3">
          <div className="flex items-center gap-2.5 pb-2 border-b border-volt-line">
            <Network className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-100">Localhost Port Matrix</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
            {[
              ["Proxy OCPP ingress", "ws://localhost:8000", "text-slate-200"],
              ["Dashboard feed", "ws://localhost:8100", "text-slate-200"],
              ["Mock CSMS backend", "ws://localhost:9000", "text-slate-200"],
              ["Twin control channel", "ws://localhost:9100", "text-amber-300"],
            ].map(([label, addr, cls]) => (
              <div
                key={label}
                className="px-3 py-2 rounded-md bg-volt-bg border border-volt-line flex justify-between items-center gap-3"
              >
                <span className="text-volt-muted font-sans">{label}</span>
                <span className={`${cls} font-medium`}>{addr}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Detection threshold */}
        <div className="p-4 rounded-lg glass-panel space-y-3">
          <div className="flex items-center gap-2.5 pb-2 border-b border-volt-line">
            <Sliders className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-100">Detection Threshold</h3>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-md bg-volt-bg border border-volt-line">
            <div>
              <div className="text-sm font-medium text-slate-100">Risk Index alert threshold</div>
              <div className="text-xs text-volt-muted mt-0.5">
                A station is flagged for review when its anomaly score rises above the threshold.
              </div>
            </div>
            <span className="font-mono px-2 py-1 rounded bg-state-warn/15 text-amber-300 border border-amber-500/40 text-xs font-medium">
              0.65
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
