"use client";

import React, { useState, useCallback } from "react";
import { useFeed } from "../lib/useFeed";
import { useAudioAlert } from "../lib/useAudioAlert";
import { useVoiceAlert } from "../lib/useVoiceAlert";
import { StationStatus, TelemetryEvent, ThreatEvent } from "../lib/types";
import { WaveBackground } from "../components/WaveBackground";
import { PowerChart } from "../components/PowerChart";
import { TransformerGauge } from "../components/TransformerGauge";
import { ThreatBadge } from "../components/ThreatBadge";
import { Footer } from "../components/Footer";
import { StoryLanding } from "../components/StoryLanding";
import { LoginModal } from "../components/LoginModal";
import { LoadingScreen } from "../components/LoadingScreen";
import { AccountView } from "../components/AccountView";
import { SettingsView } from "../components/SettingsView";
import {
  Icon3DShield,
} from "../components/3dIcons";
import { Play, Volume2, Radio, Zap, Download, ShieldAlert, Hexagon, User, Settings, LayoutDashboard, Globe } from "lucide-react";

type ViewState = "landing" | "noc" | "account" | "settings";
type NocTab = "all" | "grid" | "fleet" | "threats";

const ALL_STATIONS = ["CP-01", "CP-02", "CP-03", "CP-04", "CP-05", "CP-06", "CP-07", "CP-08"];

function getStatusBadgeStyle(status: StationStatus | undefined) {
  switch (status) {
    case "Charging":
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold";
    case "Available":
      return "bg-volt-green/20 text-volt-green border-volt-green/40 font-semibold";
    case "Preparing":
      return "bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold";
    case "Finishing":
      return "bg-volt-green/20 text-volt-green border-volt-green/40 font-semibold";
    case "Quarantined":
      return "bg-rose-500/30 text-rose-300 border-rose-500/60 animate-pulse font-bold";
    case "Offline":
      return "bg-slate-800/80 text-slate-400 border-slate-700 font-semibold";
    default:
      return "bg-slate-800/80 text-slate-400 border-slate-700 font-semibold";
  }
}

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>("landing");
  const [nocTab, setNocTab] = useState<NocTab>("all");
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [waveOpacity] = useState(0.65); // Fixed at 65%

  const { isUnlocked, unlockAudio, playAlert } = useAudioAlert();
  const { isEnabled: voiceEnabled, setIsEnabled: setVoiceEnabled, speakThreat } = useVoiceAlert();

  const handleThreat = useCallback(
    (threat: ThreatEvent) => {
      if (threat.tier === 1 || threat.severity === "high") {
        playAlert();
        speakThreat(threat);
      }
    },
    [playAlert, speakThreat]
  );

  const { stations, grid, threats, powerHistory, isConnected, mode, setMode } = useFeed({
    source: "fixture",
    onThreat: handleThreat,
  });

  const navigateTo = (view: ViewState, msg = "Loading Proxy View...") => {
    setLoadingMessage(msg);
    setIsLoading(true);
    setTimeout(() => {
      setCurrentView(view);
      setIsLoading(false);
      window.scrollTo(0, 0);
    }, 600);
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
    <div className="relative min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-between selection:bg-volt-green selection:text-slate-950">
      {/* Dynamic 3D Kexsio Wave Canvas Background (Fixed at 0.65 Opacity) */}
      <WaveBackground opacity={0.65} />

      {/* Loading Screen Overlay */}
      {isLoading && <LoadingScreen message={loadingMessage} />}

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={(userData) => {
          setUser(userData);
          navigateTo("noc", "Authenticating Operator SSO & Connecting Ingress Feed...");
        }}
      />

      {/* Global Starlink-Style Navbar */}
      <nav className="relative z-30 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur-md px-6 sm:px-12 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <div
            onClick={() => navigateTo("landing", "Navigating to VoltSentry Overview...")}
            className="flex items-center space-x-2.5 cursor-pointer group"
          >
            <Hexagon className="w-6 h-6 text-volt-green stroke-[2] group-hover:rotate-12 transition-transform" />
            <span className="text-lg font-black tracking-wider uppercase font-mono text-white">
              VOLTSENTRY <span className="text-volt-green text-xs tracking-normal">AI</span>
            </span>
          </div>

          {/* Center Navigation Links */}
          <div className="hidden md:flex items-center space-x-8 font-mono text-xs text-slate-300">
            <button
              onClick={() => navigateTo("landing", "Loading Overview...")}
              className={`hover:text-white transition-colors flex items-center space-x-1.5 ${
                currentView === "landing" ? "text-volt-green font-bold" : ""
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>OVERVIEW</span>
            </button>
            <button
              onClick={() => navigateTo("noc", "Connecting to NOC Security Console...")}
              className={`hover:text-white transition-colors flex items-center space-x-1.5 ${
                currentView === "noc" ? "text-volt-green font-bold" : ""
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>FLEET NOC</span>
            </button>
            <button
              onClick={() => navigateTo("account", "Loading Operator Profile...")}
              className={`hover:text-white transition-colors flex items-center space-x-1.5 ${
                currentView === "account" ? "text-volt-green font-bold" : ""
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>ACCOUNT</span>
            </button>
            <button
              onClick={() => navigateTo("settings", "Loading System Settings...")}
              className={`hover:text-white transition-colors flex items-center space-x-1.5 ${
                currentView === "settings" ? "text-volt-green font-bold" : ""
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>SETTINGS</span>
            </button>
          </div>

          {/* Right Action Items */}
          <div className="flex items-center space-x-3 font-mono text-xs">
            {user ? (
              <button
                onClick={() => navigateTo("account")}
                className="px-3 py-1.5 rounded-xl bg-volt-green/20 text-volt-green border border-volt-green/40 font-bold"
              >
                {user.name.split(" ")[0]}
              </button>
            ) : (
              <button
                onClick={() => setIsLoginOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-white text-slate-950 font-extrabold hover:bg-slate-200 transition-all uppercase tracking-wider text-[11px]"
              >
                NOC SSO
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex-1">
        {/* VIEW 1: LANDING PAGE */}
        {currentView === "landing" && (
          <StoryLanding
            onLaunchNoc={() => navigateTo("noc", "Opening NOC Console...")}
            onOpenLogin={() => setIsLoginOpen(true)}
          />
        )}

        {/* VIEW 2: ACCOUNT PROFILE */}
        {currentView === "account" && (
          <AccountView user={user} onLogout={() => setUser(null)} />
        )}

        {/* VIEW 3: SYSTEM SETTINGS */}
        {currentView === "settings" && (
          <SettingsView
            waveOpacity={waveOpacity}
            setWaveOpacity={() => {}}
            voiceEnabled={voiceEnabled}
            setVoiceEnabled={setVoiceEnabled}
          />
        )}

        {/* VIEW 4: NOC DASHBOARD */}
        {currentView === "noc" && (
          <div className="space-y-6 pt-6 pb-16">
            {/* Header / Control Bar */}
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl glass-panel-dense shadow-2xl">
              <div className="flex items-center space-x-4">
                <div className="p-2.5 bg-slate-900/90 rounded-xl border border-volt-green/30 shadow-lg shadow-volt-green/20">
                  <Icon3DShield className="w-10 h-10" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h1 className="text-2xl font-black tracking-tight text-white">
                      VOLTSENTRY <span className="text-volt-green font-mono text-xs font-bold tracking-wider ml-2">SECURITY CONSOLE</span>
                    </h1>
                  </div>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">Real-Time Security Monitoring & Threat Protection Console for EV Charging Networks</p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-3">
                {!isUnlocked ? (
                  <button
                    onClick={unlockAudio}
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-volt-green/20 hover:bg-volt-green/30 text-volt-green border border-volt-green/40 text-xs font-bold transition-all shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-current text-volt-green" />
                    <span>START MONITORING (ENABLE AUDIO)</span>
                  </button>
                ) : (
                  <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                    <Volume2 className="w-4 h-4" />
                    <span>AUDIO & VOICE ALERTS ARMED</span>
                  </div>
                )}

                {/* Mode Switcher */}
                <div className="flex items-center bg-black/60 rounded-xl p-1 border border-white/15 text-xs font-mono">
                  <button
                    onClick={() => setMode("fixture")}
                    className={`px-3 py-1.5 rounded-lg transition-all font-bold ${
                      mode === "fixture" ? "bg-white text-black shadow-md" : "text-slate-300 hover:text-white"
                    }`}
                  >
                    DEMO REPLAY MODE
                  </button>
                  <button
                    onClick={() => setMode("live")}
                    className={`px-3 py-1.5 rounded-lg transition-all font-bold ${
                      mode === "live" ? "bg-white text-black shadow-md" : "text-slate-300 hover:text-white"
                    }`}
                  >
                    LIVE CHARGER STREAM
                  </button>
                </div>

                {/* Live Stream Indicator */}
                <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-black/60 border border-white/15 text-xs font-mono">
                  <Radio className={`w-4 h-4 ${isConnected ? "text-emerald-400 animate-pulse" : "text-rose-500"}`} />
                  <span className={isConnected ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                    {isConnected ? "MONITORING ACTIVE" : "RECONNECTING TO NETWORK..."}
                  </span>
                </div>

                {/* Forensic JSON Export Button */}
                <button
                  onClick={exportForensicLogs}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 border border-white/20 text-xs font-semibold transition-all shadow-md"
                  title="Download accumulated ThreatEvent log JSON"
                >
                  <Download className="w-3.5 h-3.5 text-volt-green" />
                  <span>EXPORT INCIDENT LOGS</span>
                </button>
              </div>
            </header>

            {/* NOC Sub-Navigation Menu Bar for Clean Admin Focus */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-2 rounded-2xl border border-white/10 text-xs font-mono shadow-lg">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setNocTab("all")}
                  className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-2 font-bold ${
                    nocTab === "all"
                      ? "bg-volt-green/20 text-volt-green border border-volt-green/40 shadow-sm"
                      : "text-slate-400 hover:text-white bg-black/40 border border-transparent"
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>FULL OVERVIEW</span>
                </button>

                <button
                  onClick={() => setNocTab("grid")}
                  className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-2 font-bold ${
                    nocTab === "grid"
                      ? "bg-volt-green/20 text-volt-green border border-volt-green/40 shadow-sm"
                      : "text-slate-400 hover:text-white bg-black/40 border border-transparent"
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  <span>POWER GRID & CHARTS</span>
                </button>

                <button
                  onClick={() => setNocTab("fleet")}
                  className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-2 font-bold ${
                    nocTab === "fleet"
                      ? "bg-volt-green/20 text-volt-green border border-volt-green/40 shadow-sm"
                      : "text-slate-400 hover:text-white bg-black/40 border border-transparent"
                  }`}
                >
                  <Radio className="w-4 h-4" />
                  <span>CHARGER FLEET ({ALL_STATIONS.length})</span>
                </button>

                <button
                  onClick={() => setNocTab("threats")}
                  className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-2 font-bold ${
                    nocTab === "threats"
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm"
                      : "text-slate-400 hover:text-white bg-black/40 border border-transparent"
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>SECURITY LOGS ({threats.length})</span>
                </button>
              </div>

              <div className="hidden lg:flex items-center space-x-2 text-[11px] text-slate-400 font-sans pr-2">
                <span>Filter View:</span>
                <span className="font-mono text-volt-green font-bold uppercase">{nocTab === "all" ? "All Sections" : nocTab}</span>
              </div>
            </div>

            {/* Transformer Gauge + Power Chart Section */}
            {(nocTab === "all" || nocTab === "grid") && (
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-1">
                  <TransformerGauge grid={grid} />
                </div>
                <div className="lg:col-span-2">
                  <PowerChart data={powerHistory} />
                </div>
              </section>
            )}

            {/* Fleet Section Header & 8-Station Grid */}
            {(nocTab === "all" || nocTab === "fleet") && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pt-2">
                  <h2 className="text-xl font-black text-slate-100 flex items-center space-x-3">
                    <Zap className="w-6 h-6 text-volt-green fill-volt-green/20" />
                    <span>Charger Fleet Overview ({ALL_STATIONS.length} Stations)</span>
                  </h2>
                  <div className="text-xs font-mono text-slate-300 bg-black/60 px-3 py-1 rounded-lg border border-white/15">
                    AI Anomaly Limit: <span className="text-amber-400 font-bold">score &gt; 0.65</span>
                  </div>
                </div>

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
                        {/* Station Header */}
                        <div className="flex items-center justify-between pb-3.5 border-b border-white/15">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-3 h-3 rounded-full bg-volt-green shadow-sm shadow-volt-green" />
                            <span className="font-mono font-black text-xl text-white">{stationId}</span>
                          </div>
                          <span
                            className={`text-xs px-3 py-1 rounded-full border font-mono tracking-wider ${getStatusBadgeStyle(
                              telemetry?.status
                            )}`}
                          >
                            {telemetry ? telemetry.status : "Connecting..."}
                          </span>
                        </div>

                        {/* Metrics */}
                        <div className="mt-4 space-y-4">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Power Draw</span>
                            <span className="font-mono font-black text-2xl text-volt-green">
                              {telemetry ? telemetry.power_kw.toFixed(1) : "0.0"} <span className="text-xs font-sans text-slate-400 font-normal">kW</span>
                            </span>
                          </div>

                          {/* SoC Bar */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-slate-400 font-medium">Battery Level (SoC)</span>
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
                                    : "bg-gradient-to-r from-volt-green to-emerald-400"
                                }`}
                                style={{ width: `${Math.min(Math.max(telemetry?.soc ?? 0, 0), 100)}%` }}
                              />
                            </div>
                          </div>

                          {/* ML Score */}
                          <div className="pt-2.5 flex items-center justify-between border-t border-white/15 text-xs font-mono">
                            <span className="text-slate-400 font-medium">AI Anomaly Score</span>
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

                          {/* Badges */}
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
                              reason="AI Anomaly score exceeds 0.65 threshold (Subtle Power Drift)"
                              actionTaken="logged"
                              compact={true}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </section>
              </div>
            )}

            {/* Threat Timeline Section */}
            {(nocTab === "all" || nocTab === "threats") && (
              <section className="p-5 rounded-2xl glass-panel space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <h3 className="text-lg font-black text-slate-200 flex items-center space-x-2">
                    <ShieldAlert className="w-5 h-5 text-rose-400" />
                    <span>Security Incident Log ({threats.length} Recorded)</span>
                  </h3>
                  <button
                    onClick={exportForensicLogs}
                    className="text-xs font-mono text-volt-green hover:underline flex items-center space-x-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Log JSON</span>
                  </button>
                </div>
                <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                  {threats.length === 0 ? (
                    <div className="text-xs font-mono text-slate-400 p-4 text-center bg-black/40 rounded-xl border border-white/10">
                      No security threats detected. All charging stations are operating safely within normal parameters.
                    </div>
                  ) : (
                    threats.map((threat, idx) => <ThreatBadge key={idx} threat={threat} />)
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Global Starlink-Style Footer */}
      <Footer />
    </div>
  );
}
