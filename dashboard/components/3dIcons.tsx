"use client";

import React from "react";

export function Icon3DShield({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shieldGrad" x1="10" y1="5" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="50%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>
        <linearGradient id="shieldGloss" x1="32" y1="6" x2="32" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <filter id="shadow3D" x="0" y="0" width="64" height="64" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="#06B6D4" floodOpacity="0.4" />
        </filter>
      </defs>
      {/* 3D Base Shield Shape */}
      <path
        d="M32 6L54 14V30C54 44.5 44.5 54 32 58C19.5 54 10 44.5 10 30V14L32 6Z"
        fill="url(#shieldGrad)"
        filter="url(#shadow3D)"
      />
      {/* Glossy Overlay */}
      <path
        d="M32 8L50 15V28C50 40 42 49 32 53C22 49 14 40 14 28V15L32 8Z"
        fill="url(#shieldGloss)"
      />
      {/* Inner Metallic Bolt */}
      <path
        d="M34 16L24 32H33L30 46L42 28H33L34 16Z"
        fill="#FFFFFF"
        style={{ filter: "drop-shadow(0px 2px 4px rgba(0,0,0,0.5))" }}
      />
    </svg>
  );
}

export function Icon3DCharger({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="chargerBody" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="60%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>
        <linearGradient id="chargerHighlight" x1="20" y1="10" x2="44" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Charger Main Body */}
      <rect x="14" y="10" width="36" height="44" rx="8" fill="url(#chargerBody)" />
      <rect x="16" y="12" width="32" height="20" rx="6" fill="url(#chargerHighlight)" />
      {/* Plug/Cable 3D */}
      <path d="M42 24V38C42 42 46 44 48 44C50 44 52 42 52 38V28" stroke="#38BDF8" strokeWidth="4" strokeLinecap="round" />
      {/* Screen/Display LED */}
      <rect x="22" y="18" width="20" height="12" rx="3" fill="#020617" />
      <circle cx="28" cy="24" r="2" fill="#10B981" />
      <circle cx="36" cy="24" r="2" fill="#06B6D4" />
    </svg>
  );
}

export function Icon3DBattery({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="batGrad" x1="8" y1="16" x2="56" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="50%" stopColor="#059669" />
          <stop offset="100%" stopColor="#064E3B" />
        </linearGradient>
      </defs>
      {/* Terminal Tip */}
      <rect x="52" y="26" width="6" height="12" rx="2" fill="#6EE7B7" />
      {/* Battery Body */}
      <rect x="8" y="16" width="44" height="32" rx="6" fill="url(#batGrad)" />
      {/* Charge Level Bars */}
      <rect x="14" y="22" width="8" height="20" rx="2" fill="#ECFDF5" />
      <rect x="25" y="22" width="8" height="20" rx="2" fill="#A7F3D0" />
      <rect x="36" y="22" width="8" height="20" rx="2" fill="#6EE7B7" />
    </svg>
  );
}

export function Icon3DAlert({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="alertGrad" x1="32" y1="6" x2="32" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FB7185" />
          <stop offset="60%" stopColor="#E11D48" />
          <stop offset="100%" stopColor="#881337" />
        </linearGradient>
        <filter id="alertGlow" x="0" y="0" width="64" height="64" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#F43F5E" floodOpacity="0.6" />
        </filter>
      </defs>
      <path
        d="M32 6L58 52C59.5 55 57.5 58 54 58H10C6.5 58 4.5 55 6 52L32 6Z"
        fill="url(#alertGrad)"
        filter="url(#alertGlow)"
      />
      <path d="M32 22V36" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="46" r="3.5" fill="#FFFFFF" />
    </svg>
  );
}

export function Icon3DTransformer({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="transGrad" x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="60%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#78350F" />
        </linearGradient>
      </defs>
      <rect x="12" y="16" width="40" height="36" rx="6" fill="url(#transGrad)" />
      <path d="M22 10V16M32 8V16M42 10V16" stroke="#FDE68A" strokeWidth="4" strokeLinecap="round" />
      <circle cx="24" cy="34" r="8" stroke="#FEF3C7" strokeWidth="4" />
      <circle cx="40" cy="34" r="8" stroke="#FEF3C7" strokeWidth="4" />
    </svg>
  );
}
