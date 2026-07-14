import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './stores/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Theme-switchable tokens — CSS vars defined per-theme in
        // globals.css. rgb(var(...) / <alpha-value>) keeps every existing
        // opacity-modifier usage (bg-panel/60, border-hairline, etc.) working.
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        'panel-2': 'rgb(var(--color-panel-2) / <alpha-value>)',
        hairline: 'var(--color-hairline)',
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--color-ink-faint) / <alpha-value>)',
        },
        // Domain accents — each UI domain gets its own, see
        // design/DESIGN_SYSTEM.md §1.2. Theme-switchable (brighter in dark).
        brand: 'rgb(var(--color-brand) / <alpha-value>)',
        session: 'rgb(var(--color-session) / <alpha-value>)',
        analytics: 'rgb(var(--color-analytics) / <alpha-value>)',
        // Semantic accents — cross-cutting meaning, theme-switchable.
        success: 'rgb(var(--color-success) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        replay: 'rgb(var(--color-replay) / <alpha-value>)',
        // Chart-series-only categorical palette — never used as UI chrome.
        chart: {
          clay: 'rgb(var(--chart-clay) / <alpha-value>)',
          petrol: 'rgb(var(--chart-petrol) / <alpha-value>)',
          ochre: 'rgb(var(--chart-ochre) / <alpha-value>)',
          blue: 'rgb(var(--chart-blue) / <alpha-value>)',
          moss: 'rgb(var(--chart-moss) / <alpha-value>)',
          plum: 'rgb(var(--chart-plum) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Iowan Old Style', 'Palatino Linotype', 'serif'],
        sans: ['var(--font-sans)', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-mono)', 'SF Mono', 'monospace'],
      },
      fontSize: {
        'display-xl': ['3.75rem', { lineHeight: '1.05', letterSpacing: '-0.01em', fontWeight: '600' }],
        'display-l': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.01em', fontWeight: '600' }],
        'display-m': ['1.75rem', { lineHeight: '1.15', fontWeight: '500' }],
        'display-s': ['1.375rem', { lineHeight: '1.2', fontWeight: '500' }],
        'body-l': ['1.125rem', { lineHeight: '1.6' }],
        'body-m': ['0.9375rem', { lineHeight: '1.55' }],
        'body-s': ['0.8125rem', { lineHeight: '1.5' }],
        label: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.02em', fontWeight: '600' }],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
      },
      maxWidth: {
        content: '1320px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(20,14,8,0.06)',
        md: '0 8px 24px -8px rgba(20,14,8,0.16)',
        lg: '0 24px 48px -16px rgba(20,14,8,0.24)',
        xl: '0 40px 80px -24px rgba(20,14,8,0.36)',
        focus: '0 0 0 3px rgb(var(--color-brand) / 0.25)',
      },
      backdropBlur: {
        glass: '12px',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        settle: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        spin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'dot-bounce': {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.35' },
          '40%': { transform: 'translateY(-7px)', opacity: '1' },
        },
        'mark-breathe': {
          '0%, 100%': { opacity: '0.55', transform: 'scale(0.97)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
        'stroke-draw': {
          '0%, 15%': { strokeDashoffset: '160' },
          '55%, 90%': { strokeDashoffset: '0' },
          '100%': { strokeDashoffset: '160' },
        },
      },
      animation: {
        rise: 'rise 260ms ease-out both',
        settle: 'settle 240ms cubic-bezier(0.16,1,0.3,1) both',
        shimmer: 'shimmer 1.4s infinite linear',
        'dot-bounce': 'dot-bounce 1.1s ease-in-out infinite',
        'mark-breathe': 'mark-breathe 2.2s ease-in-out infinite',
        'stroke-draw': 'stroke-draw 3.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
