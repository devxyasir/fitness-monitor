import type { Metadata } from 'next';
import AuthInitializer from './components/AuthInitializer';

import './globals.css';

export const metadata: Metadata = {
  title: 'ReplayCoach',
  description: 'Live coaching platform with full-session DVR replay and skeleton tracking.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthInitializer>{children}</AuthInitializer>
      </body>
    </html>
  );
}

