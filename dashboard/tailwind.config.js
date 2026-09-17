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
      backgroundImage: {
        // Micro-grid dot field for SCADA surfaces. Pair with `bg-dot-grid`
        // sizing set in globals.css.
        'dot-grid':
          'radial-gradient(rgba(148,163,184,0.16) 1px, transparent 1px)',
        'dot-grid-green':
          'radial-gradient(rgba(16,185,129,0.20) 1px, transparent 1px)',
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
        // Horizontal scanner beam sweeping across a badge / panel.
        'laser-sweep': {
          '0%': { transform: 'translateX(-120%)', opacity: '0' },
          '12%': { opacity: '1' },
          '88%': { opacity: '1' },
          '100%': { transform: 'translateX(120%)', opacity: '0' },
        },
        // Expanding radar ring — used on live/active state dots.
        'radar-ping': {
          '0%': { transform: 'scale(0.7)', opacity: '0.85' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        // Breathing emerald/cyan glow for armed controls.
        'electric-glow': {
          '0%,100%': {
            boxShadow:
              '0 0 0 1px rgba(16,185,129,0.35), 0 0 14px -4px rgba(16,185,129,0.55)',
          },
          '50%': {
            boxShadow:
              '0 0 0 1px rgba(34,211,238,0.55), 0 0 26px -4px rgba(34,211,238,0.75)',
          },
        },
      },
      animation: {
        'volt-rise': 'volt-rise 0.7s cubic-bezier(0.22,1,0.36,1) both',
        'volt-pulse-line': 'volt-pulse-line 2.4s ease-in-out infinite',
        'laser-sweep': 'laser-sweep 1.6s cubic-bezier(0.4,0,0.2,1) infinite',
        'radar-ping': 'radar-ping 1.8s cubic-bezier(0,0,0.2,1) infinite',
        'electric-glow': 'electric-glow 2.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
