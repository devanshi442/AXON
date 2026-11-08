/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // ── AXON LunarSight Unified Design Tokens (Phase B) ──────────────────
      // Background: #050608
      // Panels:     #0D1014
      // Borders:    #2A2D31
      // Text:       #E4E4E2 (primary) / #8A8A88 (secondary/muted)
      // Frame/Headings tan: #B9A58C
      // Scenario A amber:   #E0A04A
      // Scenario B steel:   #6FA8C9
      // Lit green:          #6DBF8B
      // Dark grey:          #6B6F75
      // Warning:            #E5604A
      // Radius <= 4 px, no glow
      colors: {
        space: {
          950: '#050608',   // app background deepest
          900: '#050608',   // app background main
          850: '#090C10',
          800: '#0D1014',   // card/panel background
          750: '#13171E',
          700: '#171B22',   // elevated surface
          600: '#2A2D31',   // border / divider
          500: '#6B6F75',   // dark grey
          400: '#8A8A88',   // secondary text
          300: '#8A8A88',   // tertiary text
          200: '#E4E4E2',   // body text
          100: '#E4E4E2',   // high-emphasis text
          50:  '#FFFFFF',
        },
        tan: {
          DEFAULT: '#B9A58C',
          300: '#D1C2AF',
          400: '#B9A58C',
          500: '#A48E73',
          600: '#8E7A60',
        },
        sun: {
          DEFAULT: '#E0A04A',
          50:  '#FDF8EE',
          100: '#FAECD0',
          200: '#F5D9A1',
          300: '#E0A04A',
          400: '#E0A04A',
          500: '#E0A04A',
          600: '#C88B35',
          700: '#A46F25',
          800: '#7E5318',
          900: '#54360E',
        },
        earth: {
          DEFAULT: '#6FA8C9',
          50:  '#F0F7FB',
          100: '#DBECF5',
          200: '#B8D9EC',
          300: '#6FA8C9',
          400: '#6FA8C9',
          500: '#6FA8C9',
          600: '#548EA9',
          700: '#3E7089',
          800: '#2C5367',
          900: '#1D3745',
        },
        amber: {
          DEFAULT: '#E0A04A',
          300: '#E0A04A',
          400: '#E0A04A',
          500: '#E0A04A',
          600: '#C88B35',
        },
        steel: {
          DEFAULT: '#6FA8C9',
          300: '#6FA8C9',
          400: '#6FA8C9',
          500: '#6FA8C9',
        },
        lit: {
          DEFAULT: '#6DBF8B',
          300: '#8FD2A7',
          400: '#6DBF8B',
          500: '#6DBF8B',
          600: '#539E6E',
        },
        emerald: {
          DEFAULT: '#6DBF8B',
          300: '#6DBF8B',
          400: '#6DBF8B',
          500: '#6DBF8B',
          600: '#539E6E',
        },
        darkgrey: {
          DEFAULT: '#6B6F75',
          400: '#6B6F75',
          500: '#6B6F75',
        },
        gray: {
          DEFAULT: '#6B6F75',
          300: '#8A8A88',
          400: '#8A8A88',
          500: '#6B6F75',
          600: '#4E5257',
          700: '#2A2D31',
          800: '#171B22',
          900: '#0D1014',
        },
        warning: {
          DEFAULT: '#E5604A',
          300: '#E5604A',
          400: '#E5604A',
          500: '#E5604A',
          800: '#7F2318',
          950: '#2A1210',
        },
        rose: {
          DEFAULT: '#E5604A',
          300: '#E5604A',
          400: '#E5604A',
          500: '#E5604A',
          800: '#7F2318',
          950: '#2A1210',
        },
        cyan: {
          DEFAULT: '#6FA8C9',
          300: '#6FA8C9',
          400: '#6FA8C9',
          500: '#6FA8C9',
          800: '#2C5367',
          950: '#0C1C24',
        },
        purple: {
          DEFAULT: '#6FA8C9',
          300: '#6FA8C9',
          400: '#6FA8C9',
          500: '#6FA8C9',
        },
        indigo: {
          DEFAULT: '#6FA8C9',
          300: '#6FA8C9',
          400: '#6FA8C9',
          500: '#6FA8C9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '3xs': ['0.5625rem', { lineHeight: '0.75rem' }],
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
        lg: '4px',
        xl: '4px',
        '2xl': '4px',
        '3xl': '4px',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        'glow-sun': 'none',
        'glow-earth': 'none',
        card: 'none',
        panel: 'none',
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
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
