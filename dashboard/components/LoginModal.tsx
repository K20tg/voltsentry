"use client";

import React, { useState } from "react";
import { Shield, X, CheckCircle2 } from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: { name: string; email: string }) => void;
}

export function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const [operatorId, setOperatorId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSso = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      onLoginSuccess({
        name: "Mitha (NOC Operator)",
        email: "mitha.operator@voltsentry.noc",
      });
      onClose();
    }, 1000);
  };

  const handleOperatorLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorId) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      onLoginSuccess({
        name: `Operator ${operatorId}`,
        email: `${operatorId.toLowerCase()}@voltsentry.noc`,
      });
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md p-6 rounded-3xl glass-panel-dense border border-white/20 shadow-2xl space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-volt-green/20 border border-volt-green/40 flex items-center justify-center mx-auto text-volt-green shadow-lg">
            <Shield className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">NOC OPERATOR SSO</h2>
          <p className="text-xs text-slate-400 font-sans">
            Authenticate to access VoltSentry proxy controls & twin channels.
          </p>
        </div>

        {/* Google NOC SSO Button */}
        <button
          onClick={handleGoogleSso}
          disabled={isSubmitting}
          className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-200 text-slate-950 font-bold text-sm transition-all flex items-center justify-center space-x-3 shadow-lg active:scale-98"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{isSubmitting ? "Authenticating SSO..." : "Sign in with Google (NOC SSO)"}</span>
        </button>

        <div className="flex items-center space-x-3 text-slate-500 text-xs font-mono">
          <div className="h-px bg-slate-800 flex-1" />
          <span>OR OPERATOR ID</span>
          <div className="h-px bg-slate-800 flex-1" />
        </div>

        {/* Operator ID Form */}
        <form onSubmit={handleOperatorLogin} className="space-y-4">
          <input
            type="text"
            placeholder="Operator Badge ID (e.g. OP-8820)"
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-black/60 border border-white/15 text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:border-volt-green"
          />
          <button
            type="submit"
            disabled={!operatorId || isSubmitting}
            className="w-full py-3.5 px-4 rounded-xl bg-volt-green hover:bg-volt-green text-slate-950 font-extrabold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
          >
            {isSubmitting ? "Verifying Credentials..." : "Authenticate Session"}
          </button>
        </form>

        <div className="flex items-center justify-center space-x-1.5 text-[11px] text-slate-400 font-mono">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Localhost Security Token Valid</span>
        </div>
      </div>
    </div>
  );
}
