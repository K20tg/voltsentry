"use client";

import React, { useState } from "react";
import { useFeed } from "../lib/useFeed";
import { StationStatus, TelemetryEvent } from "../lib/types";
import { WaveBackground } from "../components/WaveBackground";
import { PowerChart } from "../components/PowerChart";
import { TransformerGauge } from "../components/TransformerGauge";
import { ThreatBadge } from "../components/ThreatBadge";
import {
  Icon3DShield,
} from "../components/3dIcons";
import { Play, Volume2, Radio, Zap, Download, ShieldAlert } from "lucide-react";

const ALL_STATIONS = ["CP-01", "CP-02", "CP-03", "CP-04", "CP-05", "CP-06", "CP-07", "CP-08"];

function getStatusBadgeStyle(status: StationStatus | undefined) {
  switch (status) {
    case "Charging":
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold";
    case "Available":
      return "bg-sky-500/20 text-sky-300 border-sky-500/40 font-semibold";
    case "Preparing":
      return "bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold";
    case "Finishing":
      return "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-semibold";
    case "Quarantined":
      return "bg-rose-500/30 text-rose-300 border-rose-500/60 animate-pulse font-bold";
    case "Offline":
      return "bg-slate-800/80 text-slate-400 border-slate-700 font-semibold";
    default:
      return "bg-slate-800/80 text-slate-400 border-slate-700 font-semibold";
  }
}

export default function Dashboard() {
  const { stations, grid, threats, powerHistory, isConnected, mode, setMode } = useFeed({ source: "fixture" });
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const unlockAudio = () => {
    setAudioUnlocked(true);
  };

  const exportForensicLogs = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(threats, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `voltsentry_forensics_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 font-sans p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Full-Screen Animated Kexsio Wave Canvas Background */}
      <WaveBackground />

      {/* Main Relative Container over Wave Canvas */}
      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        {/* VoltSentry Header / Controls Bar */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl glass-panel-dense shadow-2xl">
          <div className="flex items-center space-x-4">
            <div className="p-2.5 bg-slate-900/90 rounded-xl border border-cyan-500/30 shadow-lg shadow-cyan-500/20">
              <Icon3DShield className="w-10 h-10" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl font-black tracking-tight text-white">
                  VOLTSENTRY <span className="text-cyan-400 font-mono text-xs px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-700/60 shadow-sm ml-2">NOC PROXY</span>
                </h1>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">Inline OCPP 1.6-J Cyber-Physical Security & Threat Quarantine Twin</p>
            </div>
          </div>

          {/* Action Controls & Feed Indicators */}
          <div className="flex flex-wrap items-center gap-3">
            {!audioUnlocked ? (
              <button
                onClick={unlockAudio}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all shadow-lg"
              >
                <Play className="w-4 h-4 fill-current text-cyan-400" />
                <span>START MONITORING (AUDIO GATE)</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                <Volume2 className="w-4 h-4" />
                <span>AUDIO ARMED</span>
              </div>
            )}

            {/* Mode Switcher */}
            <div className="flex items-center bg-black/60 rounded-xl p-1 border border-white/15 text-xs font-mono">
              <button
                onClick={() => setMode("fixture")}
                className={`px-3 py-1.5 rounded-lg transition-all font-bold ${
                  mode === "fixture"
                    ? "bg-white text-black shadow-md"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                REPLAY FIXTURE
              </button>
              <button
                onClick={() => setMode("live")}
                className={`px-3 py-1.5 rounded-lg transition-all font-bold ${
                  mode === "live"
                    ? "bg-white text-black shadow-md"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                LIVE (WS :8100)
              </button>
            </div>

            {/* Live Stream Indicator */}
            <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-black/60 border border-white/15 text-xs font-mono">
              <Radio className={`w-4 h-4 ${isConnected ? "text-emerald-400 animate-pulse" : "text-rose-500"}`} />
              <span className={isConnected ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                {isConnected ? (mode === "fixture" ? "1Hz REPLAY" : "FEED ACTIVE") : "RECONNECTING"}
              </span>
            </div>

            {/* Forensic JSON Export Button */}
            <button
              onClick={exportForensicLogs}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 border border-white/20 text-xs font-semibold transition-all shadow-md"
              title="Download accumulated ThreatEvent log JSON"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>EXPORT LOGS</span>
            </button>
          </div>
        </header>

        {/* Transformer Gauge + Power Chart Section */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Transformer Gauge (1 Col) */}
          <div className="lg:col-span-1">
            <TransformerGauge grid={grid} />
          </div>

          {/* Rolling Power Chart (2 Cols) */}
          <div className="lg:col-span-2">
            <PowerChart data={powerHistory} />
          </div>
        </section>

        {/* Fleet Section Header */}
        <div className="flex items-center justify-between pt-2">
          <h2 className="text-xl font-black text-slate-100 flex items-center space-x-3">
            <Zap className="w-6 h-6 text-cyan-400 fill-cyan-400/20" />
            <span>Charger Fleet Monitoring ({ALL_STATIONS.length} Nodes)</span>
          </h2>
          <div className="text-xs font-mono text-slate-300 bg-black/60 px-3 py-1 rounded-lg border border-white/15">
            Anomaly Threshold: <span className="text-amber-400 font-bold">ml_score &gt; 0.65</span>
          </div>
        </div>

        {/* 8-Station Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {ALL_STATIONS.map((stationId) => {
            const telemetry: TelemetryEvent | undefined = stations[stationId];
            const isQuarantined = telemetry?.status === "Quarantined";
            const isMlAnomaly = (telemetry?.ml_score ?? 0) > 0.65;
            const stationThreat = threats.find((t) => t.station_id === stationId);

            return (
              <div
                key={stationId}
                className={`p-5 rounded-2xl transition-all duration-300 ${
                  isQuarantined
                    ? "glass-card-threat-tier1"
                    : isMlAnomaly
                    ? "glass-card-threat-tier2"
                    : "glass-panel hover:bg-white/15"
                }`}
              >
                {/* Station Card Header */}
                <div className="flex items-center justify-between pb-3.5 border-b border-white/15">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
                    <span className="font-mono font-black text-xl text-white">{stationId}</span>
                  </div>
                  <span
                    className={`text-xs px-3 py-1 rounded-full border font-mono tracking-wider ${getStatusBadgeStyle(
                      telemetry?.status
                    )}`}
                  >
                    {telemetry ? telemetry.status : "Awaiting Feed"}
                  </span>
                </div>

                {/* Station Metrics */}
                <div className="mt-4 space-y-4">
                  {/* Active Power */}
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Active Power</span>
                    <span className="font-mono font-black text-2xl text-cyan-300">
                      {telemetry ? telemetry.power_kw.toFixed(1) : "0.0"} <span className="text-xs font-sans text-slate-400 font-normal">kW</span>
                    </span>
                  </div>

                  {/* SoC Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400 font-medium">State of Charge (SoC)</span>
                      <span className="font-bold text-slate-200">
                        {telemetry ? `${telemetry.soc.toFixed(0)}%` : "0%"}
                      </span>
                    </div>
                    <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden p-0.5 border border-white/15">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isQuarantined
                            ? "bg-rose-500"
                            : isMlAnomaly
                            ? "bg-amber-400"
                            : "bg-gradient-to-r from-cyan-400 to-emerald-400"
                        }`}
                        style={{ width: `${Math.min(Math.max(telemetry?.soc ?? 0, 0), 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* ML Anomaly Score Bar */}
                  <div className="pt-2.5 flex items-center justify-between border-t border-white/15 text-xs font-mono">
                    <span className="text-slate-400 font-medium">ML Score</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded-md ${
                        isMlAnomaly
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/50"
                          : "bg-black/60 text-slate-200 border border-white/10"
                      }`}
                    >
                      {telemetry ? telemetry.ml_score.toFixed(2) : "0.00"}
                    </span>
                  </div>

                  {/* Dynamic Threat Badges */}
                  {isQuarantined && (
                    <ThreatBadge
                      threat={stationThreat}
                      tier={1}
                      ruleId="R2_PHYSICS"
                      reason="Power exceeds maximum rating (150.0 kW)"
                      actionTaken="quarantined"
                      compact={true}
                    />
                  )}
                  {isMlAnomaly && !isQuarantined && (
                    <ThreatBadge
                      threat={stationThreat}
                      tier={2}
                      mlScore={telemetry?.ml_score}
                      reason="ML Anomaly score exceeds 0.65 threshold (Subtle Drift)"
                      actionTaken="logged"
                      compact={true}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Threat Incident Timeline Panel */}
        <section className="p-5 rounded-2xl glass-panel space-y-3">
          <h3 className="text-lg font-black text-slate-200 flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span>Threat Incident Timeline Feed ({threats.length} Recorded)</span>
          </h3>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
            {threats.length === 0 ? (
              <div className="text-xs font-mono text-slate-400 p-3 text-center">
                No active threat incidents recorded yet. All charger sessions operating within clean parameters.
              </div>
            ) : (
              threats.map((threat, idx) => <ThreatBadge key={idx} threat={threat} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
