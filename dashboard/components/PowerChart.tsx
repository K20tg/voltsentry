"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { PowerHistoryPoint } from "../lib/useFeed";

const STATION_COLORS: Record<string, string> = {
  "CP-01": "#0FFF50", // volt green
  "CP-02": "#34D399", // emerald
  "CP-03": "#14B8A6", // teal
  "CP-04": "#A3E635", // lime
  "CP-05": "#22D3EE", // cyan-teal
  "CP-06": "#0bcc40", // deep green
  "CP-07": "#6EE7B7", // mint
  "CP-08": "#84CC16", // olive-lime
};

const STATIONS = ["CP-01", "CP-02", "CP-03", "CP-04", "CP-05", "CP-06", "CP-07", "CP-08"];

interface PowerChartProps {
  data: PowerHistoryPoint[];
}

export function PowerChart({ data }: PowerChartProps) {
  return (
    <div className="w-full h-72 p-4 rounded-2xl glass-panel flex flex-col justify-between">
      <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-volt-green animate-pulse" />
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">
            Fleet Real-Time Active Power (Rolling 60s)
          </h3>
        </div>
        <span className="text-xs font-mono text-slate-400">Unit: kW</span>
      </div>

      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs font-mono text-slate-400">
          Awaiting telemetry stream to plot power curves...
        </div>
      ) : (
        <div className="w-full flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis
                dataKey="time"
                stroke="#94A3B8"
                fontSize={10}
                tickLine={false}
                fontFamily="monospace"
              />
              <YAxis
                stroke="#94A3B8"
                fontSize={10}
                tickLine={false}
                domain={[0, 160]}
                fontFamily="monospace"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(15, 23, 42, 0.95)",
                  borderColor: "rgba(255, 255, 255, 0.15)",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontFamily: "monospace",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "10px", fontFamily: "monospace", paddingTop: "6px" }}
              />
              {STATIONS.map((stationId) => (
                <Line
                  key={stationId}
                  type="monotone"
                  dataKey={stationId}
                  stroke={STATION_COLORS[stationId] || "#94A3B8"}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
