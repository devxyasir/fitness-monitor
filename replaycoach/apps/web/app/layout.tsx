import type { Metadata } from 'next';
import localFont from 'next/font/local';
import AuthInitializer from './components/AuthInitializer';
import { ToastContainer } from './components/ToastContainer';
import { ThemeColorOverride } from './components/ThemeColorOverride';
import { MaintenanceGate } from './components/MaintenanceGate';

import './globals.css';

// Self-hosted (not next/font/google) — the production host has no outbound
// internet access, and next/font/google downloads its font files from
// Google's CDN at BUILD time, not runtime. That made every production build
// fail (missing .next/BUILD_ID → PM2 crash-loop on the web process). These
// .woff2 files are the exact same Google Fonts assets (latin subset, same
// weights), just vendored under public/fonts/ so the build has zero network
// dependency. Re-fetch from Google Fonts' CSS2 API if a weight ever needs
// to change.
//
// Fraunces (editorial serif) replaces Space Grotesk as the display face —
// see design/DESIGN_SYSTEM.md §2.1. Both normal 500/600 share one physical
// variable-font file (Google serves Fraunces this way); italic 500 is a
// second file, used only for the pull-quote pattern in DESIGN_SYSTEM.md §9.
const display = localFont({
  src: [
    { path: '../public/fonts/Fraunces-latin.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/Fraunces-latin.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/Fraunces-latin-italic.woff2', weight: '500', style: 'italic' },
  ],
  variable: '--font-display',
  display: 'swap',
});
const sans = localFont({
  src: [
    { path: '../public/fonts/Inter-latin.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/Inter-latin.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/Inter-latin.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
});
const mono = localFont({
  src: [{ path: '../public/fonts/JetBrainsMono-latin.woff2', weight: '500', style: 'normal' }],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Dance Movement Tracking and Review | LetsMove',
  description: 'Track, review and understand dance movement through detailed video analysis, live feedback and performance comparison for dancers, coaches and choreographers.',
};

// Runs before hydration so the page never paints one theme and then flips —
// reads the persisted choice (default 'light') and stamps it on <html> ahead
// of Tailwind's CSS-variable-driven colors picking it up.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem('replaycoach-theme') || 'light';
  document.documentElement.dataset.theme = t;
} catch (e) {
  document.documentElement.dataset.theme = 'light';
}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-canvas text-ink font-sans antialiased">
        <div
          aria-hidden
          className="fixed inset-0 -z-10 pointer-events-none"
          style={{
            background:
              'radial-gradient(600px circle at 15% 10%, rgb(var(--color-brand) / 0.08), transparent 60%), radial-gradient(700px circle at 85% 90%, rgb(var(--color-session) / 0.06), transparent 60%)',
          }}
        />
        <ThemeColorOverride />
        <AuthInitializer>
          <MaintenanceGate>{children}</MaintenanceGate>
        </AuthInitializer>
        <ToastContainer />
      </body>
    </html>
  );
}

