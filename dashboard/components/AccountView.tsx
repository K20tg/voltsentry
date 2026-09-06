"use client";

import React from "react";
import { ShieldCheck, UserCheck, Key, Lock, Activity } from "lucide-react";

interface AccountViewProps {
  user: { name: string; email: string } | null;
  onLogout: () => void;
}

export function AccountView({ user, onLogout }: AccountViewProps) {
  const operatorName = user?.name || "Mitha (NOC Operator)";
  const operatorEmail = user?.email || "mitha.operator@voltsentry.noc";

  return (
    <div className="max-w-4xl mx-auto space-y-8 pt-8 pb-16">
      <div className="flex items-center justify-between pb-4 border-b border-white/15">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tight">NOC OPERATOR PROFILE</h2>
          <p className="text-xs text-slate-400 font-mono mt-1">Authenticated Localhost Session & Security Token</p>
        </div>
        <button
          onClick={onLogout}
          className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold font-mono transition-all"
        >
          DISCONNECT OPERATOR
        </button>
      </div>

      {/* Profile Card */}
      <div className="p-6 rounded-3xl glass-panel-dense space-y-6">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-2xl bg-volt-green/20 border border-volt-green/40 flex items-center justify-center text-volt-green font-bold text-2xl shadow-xl">
            <UserCheck className="w-8 h-8 text-volt-green" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">{operatorName}</h3>
            <p className="text-sm font-mono text-volt-green">{operatorEmail}</p>
            <div className="inline-flex items-center space-x-1.5 mt-2 text-emerald-300 text-[10px] font-mono font-bold">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>CLEARANCE TIER-2 OPERATOR</span>
            </div>
          </div>
        </div>

        {/* Credentials & Active Session Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/10 font-mono text-xs">
          <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1">
            <div className="text-slate-400 text-[10px] uppercase flex items-center space-x-1">
              <Key className="w-3 h-3 text-volt-green" />
              <span>Active Token</span>
            </div>
            <div className="text-white font-bold truncate">vs_session_884f291</div>
          </div>

          <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1">
            <div className="text-slate-400 text-[10px] uppercase flex items-center space-x-1">
              <Lock className="w-3 h-3 text-emerald-400" />
              <span>Ingress Control</span>
            </div>
            <div className="text-emerald-400 font-bold">GRANTED (Full Access)</div>
          </div>

          <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-1">
            <div className="text-slate-400 text-[10px] uppercase flex items-center space-x-1">
              <Activity className="w-3 h-3 text-amber-400" />
              <span>Assigned Nodes</span>
            </div>
            <div className="text-white font-bold">CP-01 through CP-08</div>
          </div>
        </div>
      </div>
    </div>
  );
}
