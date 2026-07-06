import type { Metadata } from 'next';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import AuthInitializer from './components/AuthInitializer';

import './globals.css';

const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
});
const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-mono',
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

