import type { Metadata } from 'next';
import localFont from 'next/font/local';
import AuthInitializer from './components/AuthInitializer';

import './globals.css';

// Self-hosted (not next/font/google) — the production host has no outbound
// internet access, and next/font/google downloads its font files from
// Google's CDN at BUILD time, not runtime. That made every production build
// fail (missing .next/BUILD_ID → PM2 crash-loop on the web process). These
// three .woff2 files are the exact same Google Fonts assets (latin subset,
// same weights), just vendored under public/fonts/ so the build has zero
// network dependency. Re-fetch from Google Fonts' CSS2 API if a weight ever
// needs to change.
const display = localFont({
  src: [
    { path: '../public/fonts/SpaceGrotesk-latin.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/SpaceGrotesk-latin.woff2', weight: '700', style: 'normal' },
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
  title: 'ReplayCoach',
  description: 'Live coaching platform with full-session DVR replay and skeleton tracking.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="bg-canvas text-ink font-sans antialiased">
        <div
          aria-hidden
          className="fixed inset-0 -z-10 pointer-events-none"
          style={{
            background:
              'radial-gradient(600px circle at 15% 10%, rgba(99,102,241,0.10), transparent 60%), radial-gradient(700px circle at 85% 90%, rgba(139,92,246,0.08), transparent 60%)',
          }}
        />
        <AuthInitializer>{children}</AuthInitializer>
      </body>
    </html>
  );
}

