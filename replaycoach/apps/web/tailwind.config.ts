import type { Config } from 'tailwindcss';

const config: Config = {
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
        // Accent colors are identical in both themes by design (brand,
        // replay/live/danger semantics don't change with light/dark).
        brand: {
          indigo: '#6366F1',
          violet: '#8B5CF6',
        },
        replay: '#FBBF24',
        live: '#34D399',
        danger: '#F87171',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
      },
      boxShadow: {
        glow: '0 0 40px -12px rgba(99,102,241,0.55)',
      },
      backdropBlur: {
        glass: '12px',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
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
          '0%': { opacity: '0', transform: 'scale(0.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        spin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        rise: 'rise 0.25s ease-out both',
        settle: 'settle 0.5s ease-out both',
        shimmer: 'shimmer 1.4s infinite linear',
      },
    },
  },
  plugins: [],
};

export default config;
