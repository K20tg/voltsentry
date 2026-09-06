"use client";

import React, { useEffect, useState } from "react";
import { Shield, Radio, Activity } from "lucide-react";

interface LoadingScreenProps {
  onComplete?: () => void;
  message?: string;
}

export function LoadingScreen({
  onComplete,
  message = "Connecting to Proxy Stream... Waiting a moment",
}: LoadingScreenProps) {
  const [progress, setProgress] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          if (onComplete) onComplete();
          return 100;
        }
        return prev + 15;
      });
    }, 150);

    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-lg p-6 space-y-6 text-center">
      <div className="relative">
        <div className="w-20 h-20 rounded-3xl bg-volt-green/10 border border-volt-green/30 flex items-center justify-center text-volt-green shadow-2xl animate-pulse">
          <Shield className="w-10 h-10" />
        </div>
        <Activity className="w-6 h-6 text-volt-green absolute -bottom-2 -right-2 animate-spin" />
      </div>

      <div className="space-y-2 max-w-sm">
        <h3 className="text-xl font-black text-white uppercase tracking-tight">VOLTSENTRY PROXY INGRESS</h3>
        <p className="text-xs font-mono text-volt-green animate-pulse">{message}</p>
      </div>

      {/* Progress Bar */}
      <div className="w-64 bg-black/60 rounded-full h-2 overflow-hidden border border-white/15 p-0.5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-volt-green to-volt-green transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center space-x-2 text-slate-500 font-mono text-[11px]">
        <Radio className="w-3.5 h-3.5 text-emerald-400 animate-ping" />
        <span>Dialing ws://localhost:8100/feed</span>
      </div>
    </div>
  );
}
