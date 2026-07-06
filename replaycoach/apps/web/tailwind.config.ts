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
        canvas: '#070B14',
        panel: '#0F1522',
        'panel-2': '#151C2C',
        hairline: 'rgba(148,163,184,0.12)',
        ink: {
          DEFAULT: '#E7ECF5',
          muted: '#8A94A7',
          faint: '#5A6478',
        },
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
      },
      animation: {
        rise: 'rise 0.25s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
