/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // ── AXON LunarSight design tokens ──────────────────────────────────
      // Colour-blind safe: amber/gold for Sun, cyan/blue for Earth.
      // Never use red vs green for these two bodies (fails deuteranopia/protanopia).
      colors: {
        // Brand neutrals (dark-mode first)
        space: {
          950: '#05060f',   // deepest background
          900: '#0b0e1e',   // app background (dark)
          800: '#121629',   // card/panel background (dark)
          700: '#1a1f38',   // elevated surface
          600: '#252c4a',   // border / divider
          500: '#3d4870',   // muted
          400: '#6574a8',   // secondary text
          300: '#96a3cc',   // tertiary text
          200: '#c5cce0',   // body text (dark mode)
          100: '#e8eaf5',   // high-emphasis text (dark mode)
          50:  '#f4f5fa',   // app background (light)
        },
        // Sun — amber/gold (distinguishable by protanopes and deuteranopes)
        sun: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Earth — cyan/teal (distinguishable by all common CVD types)
        earth: {
          50:  '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        // Status colours (chosen to be CVD-safe)
        status: {
          success:  '#3b82f6',   // blue (not green)
          partial:  '#f59e0b',   // amber
          failed:   '#8b5cf6',   // violet (not red)
          planned:  '#6b7280',   // gray
          launched: '#60a5fa',   // light blue
          unknown:  '#374151',   // dark gray
        },
        // Verified badge
        verified:   '#3b82f6',   // blue
        unverified: '#6b7280',   // gray
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        'xl': '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        'glow-sun':   '0 0 20px 4px rgba(251, 191, 36, 0.25)',
        'glow-earth': '0 0 20px 4px rgba(6, 182, 212, 0.25)',
        'card':       '0 4px 24px rgba(0,0,0,0.4)',
        'panel':      '0 2px 12px rgba(0,0,0,0.3)',
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-up':   'slideUp 0.25s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
