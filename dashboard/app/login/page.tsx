"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, IdCard, Mail, ArrowRight, Zap } from "lucide-react";
import { useAuth, type Operator } from "../../context/AuthContext";

type Mode = "signin" | "register";

// Employee ID: optional 2–5 letter prefix + dash, then 4+ digits. "EMP-8820", "8820".
const EMPLOYEE_ID_RE = /^(?:[A-Za-z]{2,5}-)?\d{4,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEMO_OPERATOR: Operator = {
  name: "Ava Chen",
  employeeId: "EMP-8820",
  email: "operator@voltsentry.io",
};

function deriveName(employeeId: string): string {
  return `Operator ${employeeId.toUpperCase()}`;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, hydrated } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Already authenticated → straight to the NOC.
  useEffect(() => {
    if (hydrated && isAuthenticated) router.replace("/");
  }, [hydrated, isAuthenticated, router]);

  const idValid = EMPLOYEE_ID_RE.test(employeeId.trim());
  const emailValid = EMAIL_RE.test(email.trim());
  const nameValid = mode === "signin" || name.trim().length >= 2;
  const formValid = idValid && emailValid && nameValid;

  const idError = touched && employeeId && !idValid
    ? "Use a 4+ digit ID, optionally prefixed (e.g. EMP-8820)."
    : "";
  const emailError = touched && email && !emailValid
    ? "Enter a valid corporate email address."
    : "";
  const nameError = touched && mode === "register" && name && !nameValid
    ? "Operator name is required."
    : "";

  const authenticate = (op: Operator) => {
    setSubmitting(true);
    login(op);
    router.replace("/");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!formValid) return;
    authenticate({
      name: mode === "register" ? name.trim() : deriveName(employeeId.trim()),
      employeeId: employeeId.trim().toUpperCase(),
      email: email.trim(),
    });
  };

  const quickLogin = () => authenticate(DEMO_OPERATOR);

  const heading = mode === "signin" ? "Operator Sign In" : "Register New Operator";
  const cta = mode === "signin" ? "Authenticate" : "Create Operator";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-volt-bg text-volt-text font-sans flex items-center justify-center px-4 py-10">
      {/* Ambient neon field */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(15,255,80,0.12), transparent 70%), radial-gradient(40% 40% at 85% 90%, rgba(15,255,80,0.08), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(15,255,80,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(15,255,80,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Glowing gate badge */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative mb-3">
            <div className="absolute inset-0 rounded-3xl bg-volt-green/25 blur-2xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/voltsentry-logo.png"
              alt="VoltSentry"
              className="relative w-44 max-w-full drop-shadow-[0_0_18px_rgba(15,255,80,0.25)]"
            />
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-volt-green">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Security Gate</span>
          </div>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-volt-muted">
            Restricted — NOC personnel only
          </p>
          <div className="mt-4 h-px w-40 flow-line animate-volt-pulse-line" />
        </div>

        {/* Card */}
        <div className="rounded-3xl glass-panel-dense p-6 sm:p-7 shadow-2xl">
          {/* Mode toggle */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-volt-line bg-black/40 p-1 font-mono text-[11px] font-bold uppercase tracking-wider">
            {(["signin", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setTouched(false);
                }}
                className={`rounded-lg py-2 transition-colors ${
                  mode === m
                    ? "bg-volt-green text-slate-950"
                    : "text-volt-muted hover:text-white"
                }`}
              >
                {m === "signin" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          <h1 className="mb-5 font-display text-xl font-black uppercase tracking-tight text-white">
            {heading}
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === "register" && (
              <Field
                label="Operator Name"
                icon={<IdCard className="h-4 w-4" />}
                error={nameError}
              >
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="e.g. Ava Chen"
                  className={inputCls(!!nameError)}
                  autoComplete="name"
                />
              </Field>
            )}

            <Field
              label="Employee ID"
              icon={<IdCard className="h-4 w-4" />}
              error={idError}
            >
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="EMP-8820"
                className={inputCls(!!idError)}
                autoComplete="username"
                inputMode="text"
              />
            </Field>

            <Field
              label="Corporate Email"
              icon={<Mail className="h-4 w-4" />}
              error={emailError}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="operator@voltsentry.io"
                className={inputCls(!!emailError)}
                autoComplete="email"
              />
            </Field>

            <button
              type="submit"
              disabled={submitting || (touched && !formValid)}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-volt-green py-3.5 font-mono text-sm font-extrabold uppercase tracking-wider text-slate-950 transition-all hover:bg-volt-green-dim disabled:opacity-50"
            >
              {submitting ? "Verifying…" : cta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-volt-muted">
            <div className="h-px flex-1 bg-volt-line" />
            <span>or</span>
            <div className="h-px flex-1 bg-volt-line" />
          </div>

          <button
            type="button"
            onClick={quickLogin}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-volt-green/40 bg-volt-green/10 py-3 font-mono text-xs font-bold uppercase tracking-wider text-volt-green transition-all hover:bg-volt-green/20 disabled:opacity-50"
          >
            <Zap className="h-4 w-4" />
            Demo Quick-Login
          </button>

          <p className="mt-4 text-center font-mono text-[10px] leading-relaxed text-volt-muted">
            Localhost demo gate — no credentials are transmitted or verified.
          </p>
        </div>
      </div>
    </main>
  );
}

function inputCls(hasError: boolean): string {
  return [
    "w-full rounded-xl border bg-black/50 px-3.5 py-3 font-mono text-sm text-white placeholder-volt-muted/60",
    "focus:outline-none focus:ring-1",
    hasError
      ? "border-rose-500/60 focus:border-rose-400 focus:ring-rose-400/40"
      : "border-volt-line focus:border-volt-green focus:ring-volt-green/40",
  ].join(" ");
}

function Field({
  label,
  icon,
  error,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-volt-muted">
        <span className="text-volt-green">{icon}</span>
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block font-mono text-[10px] text-rose-400">{error}</span>
      ) : null}
    </label>
  );
}
