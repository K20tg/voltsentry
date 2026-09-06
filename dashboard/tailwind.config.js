/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── VoltSentry brand palette — the single source of truth ──
        // Swap-in target for every former cyan/sky/blue/indigo/purple accent.
        // Threat semantics (rose = Tier-1, amber = Tier-2/ML) stay as-is.
        volt: {
          bg: '#0a0e0d',        // page background — near-black with a green-navy hint
          surface: '#101614',   // cards, one step lighter than the page
          elevated: '#16201c',  // hover / raised surfaces
          green: '#0FFF50',     // primary accent — EV charge green
          'green-dim': '#0bcc40',
          'green-deep': '#07481f',
          line: 'rgba(15,255,80,0.16)',   // 1px borders
          text: '#e6f2ec',      // off-white body
          muted: '#8aa39a',     // secondary text
        },
      },
      boxShadow: {
        'volt-glow': '0 0 15px rgba(15,255,80,0.15)',
        'volt-glow-sm': '0 0 8px rgba(15,255,80,0.13)',
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
