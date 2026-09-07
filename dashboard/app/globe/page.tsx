"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Globe as GlobeIcon } from "lucide-react";
// GlobeView only imports React at module scope; three/globe.gl are lazy-loaded
// inside its effect, so it is SSR-safe to import directly from this client page.
import { GlobeView } from "../../components/GlobeView";
import { RequireAuth } from "../../context/AuthContext";

export default function GlobePage() {
  return (
    <RequireAuth>
    <main className="relative w-screen h-screen overflow-hidden bg-[#050811] text-volt-text">
      {/* Globe fills the viewport */}
      <div className="absolute inset-0">
        <GlobeView />
      </div>

      {/* Top overlay bar */}
      <div className="absolute top-0 left-0 right-0 z-20 px-6 sm:px-10 py-5 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2.5 pointer-events-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/voltsentry-mark.png" alt="VoltSentry" className="w-7 h-7 rounded-md" />
          <span className="text-lg font-black tracking-wider uppercase font-mono text-white">
            VOLTSENTRY
          </span>
        </div>
        <Link
          href="/"
          className="pointer-events-auto flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-black/50 border border-volt-line backdrop-blur-md text-xs font-mono font-bold text-volt-text hover:text-volt-green transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>BACK TO STORY</span>
        </Link>
      </div>

      {/* Title / caption block */}
      <div className="absolute top-24 left-6 sm:left-10 z-10 max-w-md pointer-events-none">
        <div className="inline-flex items-center gap-2 text-volt-green font-mono text-[11px] font-bold tracking-widest uppercase mb-4">
          <GlobeIcon className="w-3.5 h-3.5" />
          <span>GLOBAL CHARGING NETWORK</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
          Every point is a <span className="text-volt-green">live attack surface</span>.
        </h1>
        <p className="mt-3 text-sm text-volt-muted leading-relaxed font-sans">
          Real EV charging hubs from OpenChargeMap. Each is an OCPP endpoint a
          transport-layer proxy like VoltSentry would sit in front of. Drag to
          orbit, scroll to zoom, hover a node for its power profile.
        </p>
      </div>
    </main>
    </RequireAuth>
  );
}
