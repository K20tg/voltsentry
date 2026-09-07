"use client";

import React, { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useFeed } from "../lib/useFeed";
import { useAudioAlert } from "../lib/useAudioAlert";
import { useVoiceAlert } from "../lib/useVoiceAlert";
import { StationStatus, TelemetryEvent, ThreatEvent } from "../lib/types";
import { WaveBackground } from "../components/WaveBackground";
import { AmbientVideo } from "../components/AmbientVideo";
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
import { Play, Volume2, Radio, Zap, Download, ShieldAlert, User, Settings, LayoutDashboard, Globe, Box, Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { RequireAuth, useAuth } from "../context/AuthContext";

/**
 * Three.js touches `window` at import time, so the 3D twin must never be part
 * of the server render. `ssr: false` keeps it strictly client-side; the 2D grid
 * below is unaffected and stays the fallback if WebGL is unavailable.
 */
const ChargingTwin3D = dynamic(() => import("../components/ChargingTwin3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[540px] rounded-2xl border border-white/10 bg-slate-950 flex flex-col items-center justify-center space-y-3">
      <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      <span className="font-mono text-xs text-slate-400 tracking-wider">
        INITIALISING WEBGL DIGITAL TWIN...
      </span>
    </div>
  ),
});

type ViewState = "landing" | "noc" | "account" | "settings";
type NocTab = "all" | "grid" | "fleet" | "twin3d" | "threats";

const ALL_STATIONS = ["CP-01", "CP-02", "CP-03", "CP-04", "CP-05", "CP-06", "CP-07", "CP-08"];

function getStatusBadgeStyle(status: StationStatus | undefined) {
  switch (status) {
    case "Charging":
      return "bg-state-active/10 text-cyan-300 border-cyan-500/30";
    case "Available":
      return "bg-state-healthy/10 text-emerald-300 border-emerald-500/30";
    case "Preparing":
      return "bg-state-warn/10 text-amber-300 border-amber-500/30";
    case "Finishing":
      return "bg-state-healthy/10 text-emerald-300 border-emerald-500/30";
    case "Quarantined":
      return "bg-state-critical/10 text-red-300 border-red-500/40";
    case "Offline":
      return "bg-volt-elevated text-volt-muted border-volt-line";
    default:
      return "bg-volt-elevated text-volt-muted border-volt-line";
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

  const router = useRouter();
  const { operator, logout } = useAuth();
  const handleSignOut = () => {
    logout();
    router.push("/login");
  };

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
    <RequireAuth>
    <div className="relative min-h-screen bg-volt-bg text-slate-200 font-sans flex flex-col justify-between selection:bg-volt-green/20 selection:text-slate-50">
      {/* Dynamic 3D Kexsio Wave Canvas Background (Fixed at 0.65 Opacity) */}
      <WaveBackground opacity={0.65} />

      {/* Two-phase landing video: full-screen intro splash + persistent ambient loop */}
      <AmbientVideo />

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/voltsentry-mark.png"
              alt="VoltSentry"
              className="w-7 h-7 rounded-md group-hover:rotate-12 transition-transform"
            />
            <span className="text-lg font-black tracking-wider uppercase font-mono text-white">
              VOLTSENTRY
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

          {/* Right Action Items — logged-in Operator widget */}
          <div className="flex items-center space-x-2 font-mono text-xs">
            <button
              onClick={() => navigateTo("account")}
              className="flex items-center gap-2 rounded-xl border border-volt-green/40 bg-volt-green/15 px-3 py-1.5 text-volt-green transition-colors hover:bg-volt-green/25"
              title="Open operator profile"
            >
              <User className="h-3.5 w-3.5" />
              <span className="font-bold">{(operator?.name ?? "Operator").split(" ")[0]}</span>
              <span className="rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-volt-green/90">
                {operator?.employeeId ?? "EMP-—"}
              </span>
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 font-bold uppercase tracking-wider text-[11px] text-rose-300 transition-colors hover:bg-rose-500/25"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
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
          <AccountView
            user={operator ? { name: operator.name, email: operator.email } : user}
            onLogout={handleSignOut}
          />
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
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-lg glass-panel-dense">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-volt-elevated rounded-md border border-volt-line">
                  <Icon3DShield className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-slate-100">
                    VoltSentry <span className="text-volt-muted font-mono text-[11px] font-medium tracking-wide ml-1.5">SECURITY CONSOLE</span>
                  </h1>
                  <p className="text-xs text-volt-muted mt-0.5">Real-time threat detection for EV charging networks</p>
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
                  <Download className="w-3.5 h-3.5 text-slate-400" />
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
                      ? "bg-volt-elevated text-slate-100 border border-volt-line-strong"
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
                      ? "bg-volt-elevated text-slate-100 border border-volt-line-strong"
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
                      ? "bg-volt-elevated text-slate-100 border border-volt-line-strong"
                      : "text-slate-400 hover:text-white bg-black/40 border border-transparent"
                  }`}
                >
                  <Radio className="w-4 h-4" />
                  <span>2D FLEET GRID ({ALL_STATIONS.length})</span>
                </button>

                <button
                  onClick={() => setNocTab("twin3d")}
                  className={`px-3.5 py-2 rounded-xl transition-all flex items-center space-x-2 font-bold ${
                    nocTab === "twin3d"
                      ? "bg-volt-elevated text-slate-100 border border-volt-line-strong"
                      : "text-slate-400 hover:text-white bg-black/40 border border-transparent"
                  }`}
                >
                  <Box className="w-4 h-4" />
                  <span>3D DIGITAL TWIN</span>
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
                <span className="font-mono text-slate-300 font-medium uppercase">{nocTab === "all" ? "All Sections" : nocTab}</span>
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

            {/* 3D Digital Twin — mounts only on its own tab so the 2D console
                never pays the WebGL cost, and unmounts cleanly when you leave. */}
            {nocTab === "twin3d" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pt-2">
                  <h2 className="text-xl font-black text-slate-100 flex items-center space-x-3">
                    <Box className="w-5 h-5 text-slate-400" />
                    <span>Charging Bay Digital Twin ({ALL_STATIONS.length} Bays)</span>
                  </h2>
                  <div className="text-xs font-mono text-slate-300 bg-black/60 px-3 py-1 rounded-lg border border-white/15">
                    Rendering: <span className="text-slate-300 font-medium">live telemetry</span>
                  </div>
                </div>

                <ChargingTwin3D stations={stations} threats={threats} stationIds={ALL_STATIONS} />
              </div>
            )}

            {/* Fleet Section Header & 8-Station Grid */}
            {(nocTab === "all" || nocTab === "fleet") && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pt-2">
                  <h2 className="text-xl font-black text-slate-100 flex items-center space-x-3">
                    <Zap className="w-5 h-5 text-slate-400" />
                    <span>Charger Fleet Overview ({ALL_STATIONS.length} Stations)</span>
                  </h2>
                  <div className="text-xs font-mono text-slate-300 bg-black/60 px-3 py-1 rounded-lg border border-white/15">
                    Risk Index threshold: <span className="text-amber-300 font-medium">0.65</span>
                  </div>
                </div>

                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {ALL_STATIONS.map((stationId) => {
                    const telemetry: TelemetryEvent | undefined = stations[stationId];
                    const isQuarantined = telemetry?.status === "Quarantined";
                    const isMlAnomaly = (telemetry?.ml_score ?? 0) > 0.65;
                    const stationThreat = threats.find((t) => t.station_id === stationId);
                    const risk = Math.min(Math.max(telemetry?.ml_score ?? 0, 0), 1);
                    const soc = Math.min(Math.max(telemetry?.soc ?? 0, 0), 100);
                    const isCharging = telemetry?.status === "Charging";
                    const dotClass = isQuarantined
                      ? "bg-state-critical"
                      : isMlAnomaly
                      ? "bg-state-warn"
                      : isCharging
                      ? "bg-state-active"
                      : telemetry
                      ? "bg-state-healthy"
                      : "bg-slate-600";
                    const riskBarClass = isQuarantined
                      ? "bg-state-critical"
                      : risk > 0.65
                      ? "bg-state-warn"
                      : risk > 0.4
                      ? "bg-amber-500/60"
                      : "bg-slate-500";

                    return (
                      <div
                        key={stationId}
                        className={`p-3 rounded-lg transition-colors ${
                          isQuarantined
                            ? "glass-card-threat-tier1"
                            : isMlAnomaly
                            ? "glass-card-threat-tier2"
                            : "glass-panel hover:border-volt-line-strong"
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-volt-line">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                            <span className="font-mono font-semibold text-sm text-slate-100">{stationId}</span>
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-medium tracking-wide ${getStatusBadgeStyle(
                              telemetry?.status
                            )}`}
                          >
                            {telemetry ? telemetry.status : "—"}
                          </span>
                        </div>

                        {/* Line-item telemetry */}
                        <div className="mt-2 divide-y divide-volt-line/70 font-mono text-xs">
                          <div className="flex items-center justify-between py-1">
                            <span className="font-sans text-volt-muted">Power</span>
                            <span className="text-slate-100 tabular-nums">
                              {telemetry ? telemetry.power_kw.toFixed(1) : "0.0"}
                              <span className="text-volt-muted ml-1">kW</span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <span className="font-sans text-volt-muted">SoC</span>
                            <span className="text-slate-100 tabular-nums">
                              {telemetry ? soc.toFixed(0) : "0"}
                              <span className="text-volt-muted ml-1">%</span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <span className="font-sans text-volt-muted">Energy</span>
                            <span className="text-slate-100 tabular-nums">
                              {telemetry ? telemetry.energy_register_kwh.toFixed(1) : "0.0"}
                              <span className="text-volt-muted ml-1">kWh</span>
                            </span>
                          </div>
                        </div>

                        {/* SoC bar */}
                        <div className="mt-2 h-1 w-full rounded-full bg-volt-bg overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isQuarantined ? "bg-state-critical" : isCharging ? "bg-state-active" : "bg-state-healthy"
                            }`}
                            style={{ width: `${soc}%` }}
                          />
                        </div>

                        {/* Risk Index */}
                        <div className="mt-2.5 pt-2 border-t border-volt-line">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="font-sans text-volt-muted">Risk Index</span>
                            <span
                              className={`tabular-nums font-medium ${
                                isMlAnomaly ? "text-amber-300" : "text-slate-300"
                              }`}
                            >
                              {telemetry ? risk.toFixed(2) : "0.00"}
                            </span>
                          </div>
                          <div className="mt-1 h-1 w-full rounded-full bg-volt-bg overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${riskBarClass}`}
                              style={{ width: `${risk * 100}%` }}
                            />
                          </div>
                        </div>

                        {/* Badges */}
                        {isQuarantined && (
                          <div className="mt-2">
                            <ThreatBadge
                              threat={stationThreat}
                              tier={1}
                              ruleId="R2_PHYSICS"
                              reason="Power exceeds maximum rating (150.0 kW)"
                              actionTaken="quarantined"
                              compact={true}
                            />
                          </div>
                        )}
                        {isMlAnomaly && !isQuarantined && (
                          <div className="mt-2">
                            <ThreatBadge
                              threat={stationThreat}
                              tier={2}
                              mlScore={telemetry?.ml_score}
                              reason="Risk Index above 0.65 threshold (subtle power drift)"
                              actionTaken="logged"
                              compact={true}
                            />
                          </div>
                        )}
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
                    className="text-xs font-mono text-slate-300 hover:text-slate-100 flex items-center space-x-1"
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
    </RequireAuth>
  );
}
