"use client";

import React from "react";
import { GridEvent } from "../lib/types";
import { Icon3DTransformer } from "./3dIcons";

interface TransformerGaugeProps {
  grid: GridEvent | null;
}

export function TransformerGauge({ grid }: TransformerGaugeProps) {
  const capacity = grid?.transformer_capacity_kva ?? 500.0;
  const load = grid?.total_load_kw ?? 0.0;
  const loadPct = Math.min(Math.max((load / capacity) * 100, 0), 100);
  const headroom = grid?.headroom_pct ?? 100.0;
  const activeStations = grid?.active_stations ?? 0;

  const getGaugeColor = () => {
    if (headroom < 10.0) return "bg-rose-500 text-rose-400";
    if (headroom < 20.0) return "bg-amber-400 text-amber-400";
    return "bg-emerald-400 text-emerald-400";
  };

  return (
    <div className="w-full p-4 rounded-2xl glass-panel flex flex-col justify-between space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center space-x-2">
          <Icon3DTransformer className="w-6 h-6" />
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">
            Substation Load Capacity
          </h3>
        </div>
        <span className="text-xs font-mono text-slate-400">
          Max Limit: <span className="text-slate-200 font-bold">{capacity} kVA</span>
        </span>
      </div>

      {/* Main Load Readout */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Current Power Usage</div>
          <div className="text-3xl font-black font-mono text-white mt-0.5">
            {load.toFixed(1)} <span className="text-sm text-slate-400 font-normal">kW</span>
          </div>
        </div>
        <div className="text-right font-mono">
          <div className="text-xs text-slate-400">Available Reserve</div>
          <div className={`text-xl font-bold ${getGaugeColor().split(" ")[1]}`}>
            {headroom.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Progress Bar Gauge */}
      <div className="space-y-1">
        <div className="w-full bg-black/60 rounded-full h-4 overflow-hidden p-0.5 border border-white/15">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getGaugeColor().split(" ")[0]}`}
            style={{ width: `${loadPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] font-mono text-slate-400">
          <span>0 kVA</span>
          <span>{loadPct.toFixed(1)}% Capacity Used</span>
          <span>{capacity} kVA</span>
        </div>
      </div>

      {/* Footer stats */}
      <div className="pt-2 border-t border-white/10 flex justify-between text-xs font-mono text-slate-300">
        <span>Active Chargers: <strong className="text-volt-green">{activeStations} / 8</strong></span>
        <span>Grid Health: <strong className={headroom < 15 ? "text-amber-400 animate-pulse" : "text-emerald-400"}>
          {headroom < 10 ? "HIGH OVERLOAD RISK" : headroom < 20 ? "HIGH POWER DEMAND" : "NORMAL OPERATION"}
        </strong></span>
      </div>
    </div>
  );
}
