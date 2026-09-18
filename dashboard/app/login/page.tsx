"use client";

/**
 * VoltSentry security gate.
 *
 * Still the same DEMO gate as before — see context/AuthContext.tsx. No
 * credentials are transmitted or verified; the validation below is shape-only
 * so the form behaves like the real thing on stage.
 *
 * The chrome around it is a robotic SCADA badge reader: a holographic scanner
 * that sweeps on hover/focus, procedural Web Audio cues (no media files), and
 * clearance HUD badges.
 */

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  IdCard,
  Mail,
  ArrowRight,
  Zap,
  Fingerprint,
  Lock,
  Cpu,
  ScanLine,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useAuth, type Operator } from "../../context/AuthContext";
import { useSecurityAudio } from "../../lib/useSecurityAudio";

type Mode = "signin" | "register";

// Employee ID: optional 2–5 letter prefix + dash, then 4+ digits. "EMP-8820", "8820".
const EMPLOYEE_ID_RE = /^(?:[A-Za-z]{2,5}-)?\d{4,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEMO_OPERATOR: Operator = {
  name: "Ava Chen",
  employeeId: "EMP-8820",
  email: "operator@voltsentry.io",
};

/** How long the "ACCESS GRANTED" state holds so the chime lands before nav. */
const GRANT_DWELL_MS = 620;

function deriveName(employeeId: string): string {
  return `Operator ${employeeId.toUpperCase()}`;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, hydrated } = useAuth();
  const { playChirp, setMuted } = useSecurityAudio();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [granted, setGranted] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [denied, setDenied] = useState(false);
  const [audioOn, setAudioOn] = useState(true);

  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const denyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Already authenticated → straight to the NOC.
  useEffect(() => {
    if (hydrated && isAuthenticated) router.replace("/");
  }, [hydrated, isAuthenticated, router]);

  useEffect(() => {
    return () => {
      if (scanTimer.current) clearTimeout(scanTimer.current);
      if (navTimer.current) clearTimeout(navTimer.current);
      if (denyTimer.current) clearTimeout(denyTimer.current);
    };
  }, []);

  useEffect(() => {
    setMuted(!audioOn);
  }, [audioOn, setMuted]);

  const idValid = EMPLOYEE_ID_RE.test(employeeId.trim());
  const emailValid = EMAIL_RE.test(email.trim());
  const nameValid = mode === "signin" || name.trim().length >= 2;
  const formValid = idValid && emailValid && nameValid;

  // Empty-but-required must report too: the submit button stays enabled so a
  // rejected attempt can fire the deny cue, which means the form owes the
  // operator a visible reason as well as the buzz.
  const idError = !touched
    ? ""
    : !employeeId.trim()
    ? "Employee ID is required."
    : !idValid
    ? "Use a 4+ digit ID, optionally prefixed (e.g. EMP-8820)."
    : "";
  const emailError = !touched
    ? ""
    : !email.trim()
    ? "Corporate email is required."
    : !emailValid
    ? "Enter a valid corporate email address."
    : "";
  const nameError =
    !touched || mode !== "register"
      ? ""
      : !name.trim()
      ? "Operator name is required."
      : !nameValid
      ? "Operator name must be at least 2 characters."
      : "";

  /** Focusing a field fires the badge reader: beep + laser sweep. */
  const handleFieldFocus = () => {
    playChirp("scan");
    setScanning(true);
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(() => setScanning(false), 1700);
  };

  const authenticate = (op: Operator) => {
    setSubmitting(true);
    setDenied(false);
    setGranted(true);
    playChirp("grant");
    // Hold the granted state briefly so the chime and the HUD flip are seen.
    navTimer.current = setTimeout(() => {
      login(op);
      router.replace("/");
    }, GRANT_DWELL_MS);
  };

  const reject = () => {
    playChirp("deny");
    setDenied(true);
    if (denyTimer.current) clearTimeout(denyTimer.current);
    denyTimer.current = setTimeout(() => setDenied(false), 2600);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!formValid) {
      reject();
      return;
    }
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
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-volt-bg px-4 py-10 font-sans text-volt-text">
      {/* Ambient neon field */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(16,185,129,0.14), transparent 70%), radial-gradient(40% 40% at 85% 90%, rgba(34,211,238,0.10), transparent 70%)",
        }}
      />
      {/* Micro-grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-dot-grid-green bg-dot-grid opacity-40"
      />

      <div className="relative grid w-full max-w-5xl grid-cols-1 items-center gap-8 lg:grid-cols-[1.05fr_minmax(0,26rem)]">
        {/* ── Left: visual command deck (desktop only; the badge scanner is the
             compact header on mobile) ── */}
        <aside className="hidden flex-col gap-6 lg:flex">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-volt-green/25 blur-2xl" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/voltsentry-logo.png"
                alt="VoltSentry"
                className="relative w-52 max-w-full drop-shadow-[0_0_18px_rgba(16,185,129,0.25)]"
              />
            </div>
          </div>

          <div>
            <h2 className="font-display text-3xl font-black leading-tight tracking-tight text-white">
              Grid Command
              <br />
              <span className="bg-gradient-to-r from-[#00F0FF] to-[#00FF66] bg-clip-text text-transparent">
                Access Terminal
              </span>
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-volt-muted">
              Authenticate to open the VoltSentry NOC — live OCPP inspection, the
              cyber-physical twin, and the fleet threat console.
            </p>
          </div>

          {/* Clearance ladder */}
          <div className="space-y-2">
            {[
              { role: "OPERATOR", desc: "Monitor & acknowledge", on: true },
              { role: "DEFENSE_ADMIN", desc: "Quarantine & de-rate", on: false },
              { role: "RED_TEAM", desc: "Attack injection", on: false },
            ].map((r) => (
              <div
                key={r.role}
                className="flex items-center justify-between rounded-xl border border-volt-line bg-black/40 px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      r.on ? "bg-volt-green animate-pulse" : "bg-volt-muted/50"
                    }`}
                  />
                  <span className="font-mono text-xs font-bold tracking-wider text-volt-text">
                    {r.role}
                  </span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-volt-muted">
                  {r.desc}
                </span>
              </div>
            ))}
          </div>

          {/* Integrity stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-volt-green/25 bg-volt-green/[0.06] px-3 py-2.5">
              <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-volt-green">
                <Lock className="h-3 w-3" /> Encryption
              </div>
              <div className="mt-1 font-mono text-[11px] text-volt-text">OCPP 1.6-J · active</div>
            </div>
            <div className="rounded-xl border border-state-active/25 bg-state-active/[0.06] px-3 py-2.5">
              <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-state-active">
                <ShieldCheck className="h-3 w-3" /> Protocol
              </div>
              <div className="mt-1 font-mono text-[11px] text-volt-text">Zero-trust · localhost</div>
            </div>
          </div>

          {/* Thin animated grid line */}
          <div className="h-px w-full flow-line animate-volt-pulse-line" />
        </aside>

        {/* ── Right: access gate ── */}
        <div className="relative w-full">
        {/* Audio toggle — reviewers on a quiet machine can kill the cues. */}
        <button
          type="button"
          onClick={() => setAudioOn((v) => !v)}
          className="mb-2 ml-auto flex items-center gap-1.5 rounded-lg border border-volt-line bg-black/50 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-volt-muted transition-colors hover:text-volt-green"
          title={audioOn ? "Mute gate audio" : "Unmute gate audio"}
          aria-pressed={audioOn}
        >
          {audioOn ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          )}
          {audioOn ? "SFX On" : "SFX Off"}
        </button>

        {/* ── Holographic badge scanner ── */}
        <div
          className="group relative mb-6 overflow-hidden rounded-2xl glass-panel-futuristic p-4 scanlines"
          onMouseEnter={handleFieldFocus}
          tabIndex={0}
          onFocus={handleFieldFocus}
          role="img"
          aria-label="Operator badge scanner"
        >
          {/* Laser sweep — runs on hover, focus, or while a field is active. */}
          <div
            aria-hidden
            className={`laser-beam ${
              scanning
                ? "animate-laser-sweep"
                : "opacity-0 group-hover:animate-laser-sweep group-hover:opacity-100"
            }`}
          />

          <div className="relative flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-xl bg-volt-green/25 blur-xl" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/voltsentry-mark.png"
                alt="VoltSentry"
                className="relative h-14 w-14 rounded-xl border border-volt-green/30"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-volt-green">
                <Fingerprint className="h-3 w-3" />
                <span>Operator Badge</span>
              </div>
              <div className="mt-1 truncate font-display text-lg font-black tracking-tight text-white">
                {granted
                  ? "ACCESS GRANTED"
                  : denied
                  ? "ACCESS DENIED"
                  : employeeId.trim()
                  ? employeeId.trim().toUpperCase()
                  : "AWAITING CREDENTIAL"}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-volt-muted">
                <ScanLine className="h-3 w-3" />
                <span>
                  {granted
                    ? "Gate open — routing to NOC"
                    : denied
                    ? "Credential rejected — check fields below"
                    : scanning
                    ? "Scanning credential…"
                    : "Present badge to reader"}
                </span>
              </div>
            </div>

            {/* Live status lamp */}
            <div className="shrink-0">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full ${
                    granted ? "bg-volt-green" : denied ? "bg-state-critical" : "bg-state-active"
                  } animate-radar-ping`}
                />
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                    granted ? "bg-volt-green" : denied ? "bg-state-critical" : "bg-state-active"
                  }`}
                />
              </span>
            </div>
          </div>
        </div>

        {/* ── Clearance HUD badges ── */}
        <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ClearanceBadge
            icon={<ShieldCheck className="h-3 w-3" />}
            label="Clearance"
            value="Level 4"
            sub="Infra Guardian"
          />
          <ClearanceBadge
            icon={<Lock className="h-3 w-3" />}
            label="Cipher"
            value="AES-256"
            sub="GCM"
          />
          <ClearanceBadge
            icon={<Cpu className="h-3 w-3" />}
            label="ML Engine"
            value="Armed"
            sub="Isolation Forest"
          />
        </div>

        {/* ── Gate card ── */}
        <div
          className={`rounded-3xl glass-panel-dense p-6 shadow-2xl transition-shadow sm:p-7 ${
            granted ? "animate-electric-glow" : ""
          }`}
        >
          {/* Mode toggle */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-volt-line bg-black/40 p-1 font-mono text-[11px] font-bold uppercase tracking-wider">
            {(["signin", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setTouched(false);
                  playChirp("scan");
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

          {denied && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-xl border border-state-critical/40 bg-state-critical/10 p-3"
            >
              <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-rose-400" />
              <span className="font-mono text-[10px] leading-relaxed text-rose-300">
                Credential rejected — resolve the highlighted fields and retry.
              </span>
            </div>
          )}

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
                  onFocus={handleFieldFocus}
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
                onFocus={handleFieldFocus}
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
                onFocus={handleFieldFocus}
                onBlur={() => setTouched(true)}
                placeholder="operator@voltsentry.io"
                className={inputCls(!!emailError)}
                autoComplete="email"
              />
            </Field>

            <button
              type="submit"
              disabled={submitting}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-volt-green py-3.5 font-mono text-sm font-extrabold uppercase tracking-wider text-slate-950 transition-all hover:bg-[#05FFA1] hover:shadow-[0_0_26px_-6px_rgba(5,255,161,0.75)] active:scale-[0.99] disabled:opacity-50"
            >
              {granted ? "Access Granted" : submitting ? "Verifying…" : cta}
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
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-volt-green/40 bg-volt-green/10 py-3 font-mono text-xs font-bold uppercase tracking-wider text-volt-green transition-all hover:bg-volt-green/20 active:scale-[0.99] disabled:opacity-50"
          >
            <Zap className="h-4 w-4" />
            Demo Quick-Login
          </button>

          <p className="mt-4 text-center font-mono text-[10px] leading-relaxed text-volt-muted">
            Localhost demo gate — no credentials are transmitted or verified.
          </p>
        </div>
        </div>
      </div>
    </main>
  );
}

function inputCls(hasError: boolean): string {
  return [
    "w-full rounded-xl border bg-black/50 px-3.5 py-3 font-mono text-sm text-white placeholder-volt-muted/60",
    "transition-shadow focus:outline-none focus:ring-2",
    hasError
      ? "border-rose-500/60 focus:border-rose-400 focus:ring-rose-400/40"
      : "border-volt-line focus:border-volt-green focus:ring-volt-green/45 focus:shadow-[0_0_22px_-8px_rgba(16,185,129,0.9)]",
  ].join(" ");
}

function ClearanceBadge({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="glass-panel-futuristic rounded-xl px-3 py-2">
      <div className="flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-volt-muted">
        <span className="text-volt-green">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 font-mono text-xs font-bold text-white">{value}</div>
      <div className="truncate font-mono text-[9px] uppercase tracking-wider text-volt-muted/70">
        {sub}
      </div>
    </div>
  );
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
