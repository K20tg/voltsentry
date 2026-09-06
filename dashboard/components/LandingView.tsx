"use client";

import React from "react";
import { Icon3DShield, Icon3DCharger, Icon3DAlert, Icon3DTransformer } from "./3dIcons";
import { ChevronRight, ShieldCheck, Zap, Activity, Cpu } from "lucide-react";

interface LandingViewProps {
  onLaunchNoc: () => void;
  onOpenLogin: () => void;
}

export function LandingView({ onLaunchNoc, onOpenLogin }: LandingViewProps) {
  return (
    <div className="space-y-24 pb-16 pt-12">
      {/* Starlink-Style Full-Bleed Hero */}
      <section className="text-center space-y-8 max-w-4xl mx-auto pt-12">
        <div className="inline-flex items-center space-x-2 text-volt-green font-mono text-xs font-bold tracking-widest uppercase">
          <ShieldCheck className="w-4 h-4 text-volt-green" />
          <span>INLINE SECURITY PROXY FOR EV CHARGING NETWORKS</span>
        </div>

        <h1 className="text-5xl sm:text-7xl font-black tracking-tight text-white uppercase leading-[1.05]">
          PROTECTING THE GRID. <br />
          <span className="bg-gradient-to-r from-volt-green via-volt-green to-volt-green bg-clip-text text-transparent">
            FRAME BY FRAME.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-slate-300 font-normal max-w-2xl mx-auto leading-relaxed">
          VoltSentry is a software-defined, sub-millisecond reverse proxy sitting between EV chargers and CSMS backends. Intercepting OCPP 1.6-J frames to quarantine physical rule violations and subtle ML anomalies.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <button
            onClick={onLaunchNoc}
            className="px-8 py-4 rounded-xl bg-white text-slate-950 hover:bg-slate-200 font-black text-sm uppercase tracking-wider transition-all shadow-xl shadow-volt-green/10 flex items-center space-x-2 transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <span>LAUNCH NOC DASHBOARD</span>
            <ChevronRight className="w-4 h-4 stroke-[3]" />
          </button>
          <button
            onClick={onOpenLogin}
            className="px-8 py-4 rounded-xl bg-slate-900/90 text-white hover:bg-slate-800 border border-white/20 font-bold text-sm uppercase tracking-wider transition-all shadow-lg flex items-center space-x-2"
          >
            <span>OPERATOR SSO LOGIN</span>
          </button>
        </div>
      </section>

      {/* Starlink-Style Specs Matrix */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        <div className="p-6 rounded-2xl glass-panel space-y-3">
          <div className="text-xs font-mono text-volt-green font-bold uppercase tracking-widest flex items-center space-x-2">
            <Zap className="w-4 h-4" />
            <span>LATENCY</span>
          </div>
          <div className="text-4xl font-black font-mono text-white">&lt; 1.0 ms</div>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Transparent transport-layer processing added overhead per OCPP WebSocket frame.
          </p>
        </div>

        <div className="p-6 rounded-2xl glass-panel space-y-3">
          <div className="text-xs font-mono text-amber-400 font-bold uppercase tracking-widest flex items-center space-x-2">
            <Activity className="w-4 h-4" />
            <span>DETECTION</span>
          </div>
          <div className="text-4xl font-black font-mono text-white">DUAL-TIER</div>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Deterministic FSM + Isolation Forest ML scoring against subtle zero-day data drift.
          </p>
        </div>

        <div className="p-6 rounded-2xl glass-panel space-y-3">
          <div className="text-xs font-mono text-rose-400 font-bold uppercase tracking-widest flex items-center space-x-2">
            <Icon3DAlert className="w-4 h-4" />
            <span>QUARANTINE</span>
          </div>
          <div className="text-4xl font-black font-mono text-white">AUTOMATED</div>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Sends downstream ChangeAvailability calls and severs compromised sockets in real time.
          </p>
        </div>

        <div className="p-6 rounded-2xl glass-panel space-y-3">
          <div className="text-xs font-mono text-emerald-400 font-bold uppercase tracking-widest flex items-center space-x-2">
            <Cpu className="w-4 h-4" />
            <span>HARDWARE COST</span>
          </div>
          <div className="text-4xl font-black font-mono text-white">$0 SPEND</div>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Software-defined cyber-physical twin and local scikit-learn anomaly engine on localhost.
          </p>
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-8 rounded-3xl glass-panel-dense space-y-4">
          <Icon3DShield className="w-12 h-12" />
          <h3 className="text-2xl font-black text-white">Deterministic FSM & Physics Engine (Tier-1)</h3>
          <p className="text-sm text-slate-300 leading-relaxed font-sans">
            Validates state transitions (Authorize → StartTransaction → MeterValues → StopTransaction), CC-CV charging envelopes, and fleet oscillation start/stop bursts.
          </p>
        </div>

        <div className="p-8 rounded-3xl glass-panel-dense space-y-4">
          <Icon3DTransformer className="w-12 h-12" />
          <h3 className="text-2xl font-black text-white">Isolation Forest Anomaly Model (Tier-2)</h3>
          <p className="text-sm text-slate-300 leading-relaxed font-sans">
            Evaluates 5-dimensional feature vectors: power_kw, soc, dp_dt, duration_sec, and cumulative energy_residual_kwh. Triggers when ml_score exceeds 0.65.
          </p>
        </div>
      </section>
    </div>
  );
}
