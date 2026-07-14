'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import DemoVideoModal from './components/DemoVideoModal';
import { ThemeToggle } from './components/ThemeToggle';

export default function LandingPage() {
  const { user } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (mounted && user) {
    return null; // Will redirect via dashboard
  }

  return (
    <div className="min-h-screen bg-canvas text-ink relative overflow-hidden">
      {/* Ambient background */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background: 'radial-gradient(700px 500px at 20% 0%, rgba(99,102,241,0.14), transparent 60%), radial-gradient(800px 600px at 90% 20%, rgba(139,92,246,0.10), transparent 60%)',
        }}
      />

      {/* Nav */}
      <header className="sticky top-0 z-20 bg-panel/60 backdrop-blur-glass border-b border-hairline">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-indigo to-brand-violet flex items-center justify-center">
              <span className="text-[10px] font-bold text-canvas">◇</span>
            </div>
            <span className="font-display font-semibold text-[1.0625rem]">ReplayCoach</span>
          </div>
          <nav className="hidden md:flex items-center gap-7">
            <a href="#features" className="text-ink-muted text-sm hover:text-ink transition-colors">Product</a>
            <a href="#how" className="text-ink-muted text-sm hover:text-ink transition-colors">How it works</a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="text-sm font-semibold text-ink border border-hairline rounded-full px-5 py-2.5 hover:bg-panel-2 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold text-canvas bg-gradient-to-r from-brand-indigo to-brand-violet rounded-full px-5 py-2.5 hover:shadow-glow transition-all"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pt-24 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          <div className="animate-rise">
            <div className="font-mono text-xs tracking-[0.14em] text-brand-violet uppercase mb-4">Live film room</div>
            <h1 className="font-display font-bold text-[3.5rem] leading-[1.05] mb-5">
              Real-time video feedback for elite training.
            </h1>
            <p className="text-ink-muted text-lg leading-relaxed max-w-md mb-8">
              Run the call, rewind any moment, and show exactly where the form broke — with a live skeleton on every athlete.
            </p>
            <div className="flex gap-3.5 flex-wrap">
              <Link
                href="/register"
                className="inline-flex items-center px-7 py-3.5 rounded-full font-semibold text-canvas bg-gradient-to-r from-brand-indigo to-brand-violet hover:shadow-glow transition-all"
              >
                Start free
              </Link>
              <button
                type="button"
                onClick={() => setDemoOpen(true)}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-semibold text-ink border border-hairline hover:bg-panel-2 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
                Watch demo
              </button>
            </div>
            <div className="mt-12 flex items-center gap-5 flex-wrap">
              <span className="font-mono text-[0.6875rem] text-ink-faint uppercase tracking-widest">Used by coaching programs at</span>
              <span className="font-display font-semibold text-ink-faint text-sm">Ironforge Barbell</span>
              <span className="font-display font-semibold text-ink-faint text-sm">Meridian Track Club</span>
              <span className="font-display font-semibold text-ink-faint text-sm">Northline Gymnastics</span>
            </div>
          </div>

          {/* Hero visual mock */}
          <div aria-hidden className="relative animate-settle">
            <div className="bg-panel border border-hairline rounded-lg p-4 shadow-2xl">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-panel-2 border border-hairline rounded-lg aspect-[4/3] flex items-end p-2 relative">
                  <span className="text-xs text-ink-muted bg-panel/70 backdrop-blur-sm rounded-full px-2 py-0.5">Coach</span>
                </div>
                <div className="bg-panel-2 border border-hairline rounded-lg aspect-[4/3] relative overflow-hidden flex items-end p-2">
                  <HeroSkeleton />
                  <span className="relative text-xs text-ink bg-panel/70 backdrop-blur-sm rounded-full px-2 py-0.5">Student</span>
                </div>
              </div>
              <div className="mt-3 bg-panel-2 border border-hairline rounded-lg p-3">
                <div className="relative h-1 bg-replay/20 rounded-full mb-2">
                  <div className="absolute left-0 top-0 bottom-1 w-[38%] bg-replay/40 rounded-full" />
                  <div className="absolute left-[38%] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-replay shadow-[0_0_8px_rgba(251,191,36,0.7)]" />
                </div>
                <div className="flex justify-between font-mono text-[0.6875rem] text-replay">
                  <span>◍ 00:11.4 / 00:30.0</span>
                  <span className="text-ink-faint">0.5×</span>
                </div>
              </div>
            </div>
            <div className="absolute -top-3.5 -right-3.5 bg-panel/75 backdrop-blur-sm border border-hairline rounded-full px-3.5 py-1.5 font-mono text-xs shadow-lg">
              SHOULDER_L <span className="text-brand-violet">142°</span>
            </div>
          </div>
        </div>
      </section>

      {/* Demo showcase */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 pb-20">
        <button
          type="button"
          onClick={() => setDemoOpen(true)}
          className="group relative w-full rounded-lg overflow-hidden border border-hairline bg-panel block text-left"
          aria-label="Play product demo video"
        >
          <div
            aria-hidden
            className="absolute inset-0 z-0"
            style={{
              background:
                'radial-gradient(600px 300px at 30% 20%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(500px 300px at 80% 80%, rgba(139,92,246,0.14), transparent 60%)',
            }}
          />
          <div className="relative z-10 aspect-video flex items-center justify-center">
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(7,11,20,0.2), rgba(7,11,20,0.55))' }} />
            <span className="absolute top-5 left-6 font-mono text-xs tracking-[0.14em] text-brand-violet uppercase">Product demo</span>
            <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-brand-indigo to-brand-violet shadow-glow group-hover:scale-105 transition-transform duration-200">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="#070B14" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <span className="absolute bottom-6 left-6 right-6 font-display font-semibold text-lg sm:text-xl text-ink">
              Watch a live coaching session — replay, skeleton overlay, and annotations in real time.
            </span>
          </div>
        </button>
      </section>

      <DemoVideoModal open={demoOpen} onClose={() => setDemoOpen(false)} />

      {/* Features */}
      <section id="features" className="relative z-10 max-w-6xl mx-auto px-8 py-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-panel border border-hairline rounded-lg p-7 hover:border-hairline/50 hover:-translate-y-0.5 transition-all duration-150"
            >
              <div className="w-7 h-7 rounded-md bg-brand-indigo/10 flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-ink-muted text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative z-10 max-w-6xl mx-auto px-8 py-20">
        <h2 className="font-display font-semibold text-2xl mb-8">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {howItWorks.map((s) => (
            <div key={s.step}>
              <div className="font-mono text-xl text-brand-violet mb-2.5">{s.step}</div>
              <h3 className="font-display font-semibold text-lg mb-1.5">{s.title}</h3>
              <p className="text-ink-muted text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-hairline">
        <div className="max-w-6xl mx-auto px-8 py-20 text-center">
          <h2 className="font-display font-bold text-[2.25rem] mb-5">Put a skeleton on every rep.</h2>
          <a
            href="/register"
            className="inline-flex items-center px-8 py-3.5 rounded-full font-semibold text-canvas bg-gradient-to-r from-brand-indigo to-brand-violet hover:shadow-glow transition-all"
          >
            Start free
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-hairline">
        <div className="max-w-6xl mx-auto px-8 py-10 flex flex-wrap gap-8 justify-between items-start">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-brand-indigo to-brand-violet" />
            <span className="font-display font-semibold text-sm">ReplayCoach</span>
          </div>
          <div className="flex gap-12 flex-wrap">
            <FooterCol title="Product" links={['Features', 'How it works']} />
            <FooterCol title="Company" links={['About', 'Contact']} />
            <FooterCol title="Legal" links={['Privacy', 'Terms']} />
          </div>
          <div className="font-mono text-xs text-ink-faint">© 2026 ReplayCoach</div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <div className="text-[0.6875rem] text-ink-faint uppercase tracking-widest mb-2.5">{title}</div>
      <div className="flex flex-col gap-2">
        {links.map((l) => (
          <a key={l} href="#" className="text-ink-muted text-sm hover:text-ink transition-colors">{l}</a>
        ))}
      </div>
    </div>
  );
}

const features = [
  {
    title: 'Instant replay',
    body: 'Rewind the last 30 seconds without dropping the call.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.6" aria-hidden>
        <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
      </svg>
    ),
  },
  {
    title: 'Pose overlays',
    body: 'See joint angles and form on a live skeleton, frame by frame.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.6" aria-hidden>
        <circle cx="12" cy="5" r="2" /><path d="M12 7v5M12 12l-4 7M12 12l4 7M8 12h8" />
      </svg>
    ),
  },
  {
    title: 'Coaching rooms',
    body: 'Bring a cohort into one room and cue replays for everyone at once.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.6" aria-hidden>
        <rect x="3" y="4" width="8" height="8" rx="1.5" /><rect x="13" y="4" width="8" height="8" rx="1.5" />
        <rect x="3" y="14" width="8" height="6" rx="1.5" /><rect x="13" y="14" width="8" height="6" rx="1.5" />
      </svg>
    ),
  },
];

const howItWorks = [
  { step: '01', title: 'Go live', body: 'Start a room, athletes join from any device, the skeleton overlay tracks in real time.' },
  { step: '02', title: 'Catch the moment', body: 'Hit replay the instant something looks off — the last 30 seconds are always buffered.' },
  { step: '03', title: 'Show the fix', body: 'Scrub frame by frame, draw over the play, and send the clip to the athlete\'s library.' },
];

function HeroSkeleton() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 140 160" className="absolute inset-0">
      <defs>
        <linearGradient id="hero-skel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366F1" /><stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#hero-skel)" strokeWidth="1.6" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 5px rgba(139,92,246,0.65))' }}>
        <line x1="70" y1="24" x2="70" y2="60" /><line x1="70" y1="34" x2="48" y2="52" /><line x1="70" y1="34" x2="92" y2="52" />
        <line x1="70" y1="60" x2="55" y2="98" /><line x1="70" y1="60" x2="85" y2="98" />
        <line x1="55" y1="98" x2="52" y2="136" /><line x1="85" y1="98" x2="88" y2="136" />
      </g>
      <g fill="#8B5CF6" style={{ filter: 'drop-shadow(0 0 3px rgba(139,92,246,0.8))' }}>
        <circle cx="70" cy="24" r="6" /><circle cx="48" cy="52" r="2" /><circle cx="92" cy="52" r="2" />
        <circle cx="70" cy="60" r="2" /><circle cx="55" cy="98" r="2" /><circle cx="85" cy="98" r="2" />
        <circle cx="52" cy="136" r="2" /><circle cx="88" cy="136" r="2" />
      </g>
    </svg>
  );
}
