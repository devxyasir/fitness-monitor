'use client';

import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink relative overflow-hidden">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background: 'radial-gradient(600px 400px at 15% 20%, rgba(99,102,241,0.12), transparent 60%), radial-gradient(700px 500px at 85% 70%, rgba(139,92,246,0.10), transparent 60%)',
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen">
        {/* Left rail — brand + decorative skeleton */}
        <div className="hidden lg:flex flex-col justify-center p-16 relative overflow-hidden">
          <div aria-hidden className="absolute -right-10 -bottom-5 opacity-[0.08]">
            <svg width="360" height="420" viewBox="0 0 360 420">
              <defs>
                <linearGradient id="auth-rail-skel" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#6366F1" /><stop offset="1" stopColor="#8B5CF6" />
                </linearGradient>
              </defs>
              <g fill="none" stroke="url(#auth-rail-skel)" strokeWidth="2.5" strokeLinecap="round">
                <line x1="180" y1="50" x2="180" y2="150" /><line x1="180" y1="75" x2="110" y2="120" /><line x1="180" y1="75" x2="250" y2="120" />
                <line x1="180" y1="150" x2="130" y2="250" /><line x1="180" y1="150" x2="230" y2="250" />
                <line x1="130" y1="250" x2="120" y2="360" /><line x1="230" y1="250" x2="240" y2="360" />
              </g>
              <g fill="#8B5CF6">
                <circle cx="180" cy="50" r="14" /><circle cx="110" cy="120" r="4" /><circle cx="250" cy="120" r="4" />
                <circle cx="180" cy="150" r="4" /><circle cx="130" cy="250" r="4" /><circle cx="230" cy="250" r="4" />
              </g>
            </svg>
          </div>

          <div className="flex items-center gap-2.5 mb-7">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-brand-indigo to-brand-violet" />
            <span className="font-display font-semibold text-[1.0625rem]">ReplayCoach</span>
          </div>
          <h1 className="font-display font-bold text-[2.25rem] leading-[1.15] max-w-[24rem]">
            The film room for movement.
          </h1>
        </div>

        {/* Right card */}
        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-[25rem] relative animate-rise" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.4))', borderRadius: '17px', padding: '1px' }}>
            <div className="relative bg-panel/75 backdrop-blur-glass rounded-[16px] p-9">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
