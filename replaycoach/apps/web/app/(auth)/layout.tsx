'use client';

import type { ReactNode } from 'react';
import { Logomark } from '../components/Logomark';
import { SkeletonMotif } from '../components/SkeletonMotif';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink relative overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen">
        {/* Left rail — brand + decorative skeleton */}
        <div className="hidden lg:flex flex-col justify-center p-16 relative overflow-hidden">
          <SkeletonMotif className="absolute -right-10 -bottom-5 w-[360px] h-[420px] opacity-[0.10]" jointColor="brand" />

          <div className="flex items-center gap-2.5 mb-7">
            <Logomark className="w-5 h-5 text-brand" />
            <span className="font-display text-display-s">ReplayCoach</span>
          </div>
          <h1 className="font-display text-display-l text-ink max-w-[24rem] text-balance">
            The film room for movement.
          </h1>
        </div>

        {/* Right card */}
        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-[25rem] bg-panel border border-hairline rounded-lg shadow-lg p-9 animate-rise">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
