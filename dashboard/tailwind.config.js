/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Inter for UI, JetBrains Mono for telemetry (loaded in app/layout.tsx).
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // ── VoltSentry SCADA palette ──
        // Dark slate surfaces, low-contrast borders. Bright colour is reserved
        // for state (see `state.*`); green is a sparing brand accent only.
        volt: {
          bg: '#0B0F17',        // page background — dark slate
          surface: '#111827',   // cards, one step up
          elevated: '#1E293B',  // hover / raised surfaces
          green: '#10B981',     // brand accent — used sparingly
          'green-dim': '#0E7C58',
          'green-deep': '#0B3B2C',
          line: '#1E293B',      // 1px borders — low contrast
          'line-strong': '#334155',
          text: '#E2E8F0',      // body text
          muted: '#94A3B8',     // secondary text
        },
        // Semantic state highlights — the only place bright colour belongs.
        state: {
          healthy: '#10B981',   // emerald — healthy / idle
          active: '#22D3EE',    // cyan — active charging
          warn: '#F59E0B',      // amber — warnings
          critical: '#EF4444',  // red — critical anomaly / blocked node
        },
      },
      boxShadow: {
        'volt-glow': '0 1px 2px rgba(0,0,0,0.4)',
        'volt-glow-sm': '0 1px 2px rgba(0,0,0,0.35)',
        panel: '0 1px 0 rgba(255,255,255,0.02), 0 8px 24px -16px rgba(0,0,0,0.6)',
      },
      keyframes: {
        'volt-rise': {
          '0%': { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'volt-pulse-line': {
          '0%,100%': { opacity: '0.35' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'volt-rise': 'volt-rise 0.7s cubic-bezier(0.22,1,0.36,1) both',
        'volt-pulse-line': 'volt-pulse-line 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
