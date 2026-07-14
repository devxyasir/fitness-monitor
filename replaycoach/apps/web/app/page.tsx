'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import DemoVideoModal from './components/DemoVideoModal';
import { ThemeToggle } from './components/ThemeToggle';
import { Logomark } from './components/Logomark';
import { SkeletonMotif } from './components/SkeletonMotif';
import { Reveal } from './components/Reveal';
import {
  StatStrip,
  JointReadout,
  ReplayScrubberMini,
  RoomsGridMini,
  LiveTile,
  AnnotationDrawDemo,
  BandPhoto,
} from './components/LandingVisuals';
import { BroadcastIcon, RewindIcon, AnnotateIcon, TrackingIcon, SquadIcon } from './components/icons';
import { Button } from './components/ui/Button';

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
      {/* Nav */}
      <header className="sticky top-0 z-20 bg-panel/85 backdrop-blur-md border-b border-hairline">
        <div className="max-w-content mx-auto px-6 lg:px-10 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logomark className="w-6 h-6 text-brand" />
            <span className="font-display text-display-s">ReplayCoach</span>
          </div>
          <nav className="hidden md:flex items-center gap-7">
            <a href="#features" className="text-ink-muted text-sm hover:text-ink transition-colors">Product</a>
            <a href="#how" className="text-ink-muted text-sm hover:text-ink transition-colors">How it works</a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login" className="text-sm font-semibold text-ink border border-hairline rounded-full px-5 py-2.5 hover:bg-panel-2 transition-colors">
              Log in
            </Link>
            <Button href="/register" size="md">Start free</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative max-w-content mx-auto px-6 lg:px-10 pt-24 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-14 items-center">
          <div className="animate-rise">
            <div className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4">Live film room</div>
            <h1 className="font-display text-display-xl text-ink mb-5 text-balance">
              Real-time film review, built for the rep — not the meeting.
            </h1>
            <p className="text-ink-muted text-body-l max-w-md mb-8">
              Run the session live, rewind any moment without dropping the call, and
              mark exactly where the form broke — with tracked joints on every athlete.
            </p>
            <div className="flex gap-3.5 flex-wrap">
              <Button href="/register" size="lg">Start free</Button>
              <Button variant="ghost" size="lg" onClick={() => setDemoOpen(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
                Watch demo
              </Button>
            </div>
          </div>

          <HeroMock />
        </div>
      </section>

      {/* Stat strip */}
      <section className="relative max-w-content mx-auto px-6 lg:px-10 py-10 border-t border-hairline">
        <Reveal>
          <StatStrip />
        </Reveal>
      </section>

      {/* Editorial — the page's single largest photographic moment */}
      <section className="relative w-full">
        <Reveal>
          <div className="relative w-full aspect-[4/5] lg:aspect-[21/9] overflow-hidden">
            <BandPhoto
              src="/images/landing/editorial-review.jpg"
              alt="A coach and athlete reviewing footage together"
              className="absolute inset-0 w-full h-full"
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(90deg, rgb(var(--color-canvas) / 0.85), rgb(var(--color-canvas) / 0.35) 55%, rgb(var(--color-canvas) / 0.1))' }}
            />
            <div className="absolute inset-0 flex items-center">
              <div className="max-w-content mx-auto px-6 lg:px-10 w-full">
                <div className="max-w-md">
                  <span className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4 block">The film room</span>
                  <p className="font-display text-display-m text-ink text-balance">
                    Every rep gets reviewed the way it happened — together, live, with the tape right there.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Demo showcase */}
      <section className="relative max-w-content mx-auto px-6 lg:px-10 pb-20">
        <Reveal>
          <button
            type="button"
            onClick={() => setDemoOpen(true)}
            className="group relative w-full rounded-lg overflow-hidden border border-hairline bg-panel block text-left hover:-translate-y-1 hover:shadow-xl transition-all duration-200"
            aria-label="Play product demo video"
          >
            <div className="relative aspect-video flex items-center justify-center bg-panel-2">
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgb(var(--color-canvas) / 0.1), rgb(var(--color-canvas) / 0.55))' }} />
              <span className="absolute top-5 left-6 font-mono text-xs tracking-[0.14em] text-brand uppercase">Product demo</span>
              <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-brand group-hover:scale-105 transition-transform duration-200">
                <svg width="26" height="26" viewBox="0 0 24 24" className="fill-white dark:fill-canvas" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <span className="absolute bottom-6 left-6 right-6 font-display text-display-s text-ink">
                Watch a live coaching session — replay, skeleton overlay, and annotations in real time.
              </span>
            </div>
          </button>
        </Reveal>
      </section>

      <DemoVideoModal open={demoOpen} onClose={() => setDemoOpen(false)} />

      {/* Feature bands — photo-dominant, alternating layout, one per domain accent */}
      <section id="features" className="relative max-w-content mx-auto px-6 lg:px-10 py-24 space-y-24">
        {/* Signature — Tracked joints (session, photo left) */}
        <Reveal>
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
            <div className="relative w-full lg:w-[45%] aspect-[4/5] rounded-lg overflow-hidden shadow-xl hover:-translate-y-1 hover:shadow-xl transition-all duration-200">
              <BandPhoto
                src="/images/landing/signature-athlete.jpg"
                alt="An athlete mid-sprint, joints clearly visible for tracking"
                className="absolute inset-0 w-full h-full"
              />
              <SkeletonMotif className="absolute inset-0 w-full h-full p-8 opacity-90" jointColor="session" />
            </div>
            <div className="flex-1">
              <TrackingIcon className="w-8 h-8 text-session mb-4" />
              <span className="font-mono text-xs text-session uppercase tracking-widest">Signature</span>
              <h3 className="font-display text-display-m text-ink mt-3 mb-3">Tracked joints, not a filter</h3>
              <p className="text-ink-muted text-body-m max-w-md">
                Every athlete gets real pose tracking during the live call — joint
                angles update in real time, and any annotation you draw follows the
                body instead of sitting on a fixed pixel.
              </p>
              <JointReadout />
            </div>
          </div>
        </Reveal>

        {/* Replay — Rewind without dropping the call (replay, photo right) */}
        <Reveal>
          <div className="flex flex-col lg:flex-row-reverse items-center gap-10 lg:gap-16">
            <div className="relative w-full lg:w-[55%] aspect-video rounded-lg overflow-hidden shadow-xl hover:-translate-y-1 hover:shadow-xl transition-all duration-200">
              <BandPhoto
                src="/images/landing/replay-scrub.jpg"
                alt="A coach's hands scrubbing a replay timeline"
                className="absolute inset-0 w-full h-full"
              />
              <div className="absolute top-6 right-6 w-60 rounded-md overflow-hidden border border-hairline shadow-lg">
                <ReplayScrubberMini />
              </div>
            </div>
            <div className="flex-1">
              <RewindIcon className="w-8 h-8 text-replay mb-4" />
              <span className="font-mono text-xs text-replay uppercase tracking-widest">Replay</span>
              <h3 className="font-display text-display-m text-ink mt-3 mb-3">Rewind without dropping the call</h3>
              <p className="text-ink-muted text-body-m max-w-md">The last 30 seconds are always buffered — hit replay the instant something looks off.</p>
            </div>
          </div>
        </Reveal>

        {/* Rooms — Bring the whole squad in (analytics, photo left) */}
        <Reveal>
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
            <div className="relative w-full lg:w-[50%] aspect-[4/3] rounded-lg overflow-hidden shadow-xl hover:-translate-y-1 hover:shadow-xl transition-all duration-200">
              <BandPhoto
                src="/images/landing/rooms-squad.jpg"
                alt="A team of athletes training together"
                className="absolute inset-0 w-full h-full"
              />
              <div className="absolute bottom-6 right-6 bg-panel/90 backdrop-blur-glass border border-hairline rounded-md shadow-lg p-3">
                <RoomsGridMini className="w-32" />
              </div>
            </div>
            <div className="flex-1">
              <SquadIcon className="w-8 h-8 text-analytics mb-4" />
              <span className="font-mono text-xs text-analytics uppercase tracking-widest">Rooms</span>
              <h3 className="font-display text-display-m text-ink mt-3 mb-3">Bring the whole squad in</h3>
              <p className="text-ink-muted text-body-m max-w-md">One room, one cued replay, every athlete watching the same frame at once.</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* How it works */}
      <section id="how" className="relative max-w-content mx-auto px-6 lg:px-10 py-20">
        <h2 className="font-display text-display-m text-ink mb-8">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {howItWorks.map((s, i) => (
            <Reveal key={s.step} delayMs={i * 80}>
              <div>
                {s.visual}
                <div className="flex items-center gap-2.5 mt-5 mb-2.5">
                  {s.icon}
                  <span className="font-mono text-xl text-brand">{s.step}</span>
                </div>
                <h3 className="font-display text-display-s text-ink mb-1.5">{s.title}</h3>
                <p className="text-ink-muted text-sm leading-relaxed">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative border-t border-hairline">
        <div className="max-w-content mx-auto px-6 lg:px-10 py-20 text-center">
          <h2 className="font-display text-display-l text-ink mb-5">Put a skeleton on every rep.</h2>
          <Button href="/register" size="lg">Start free</Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-hairline">
        <div className="max-w-content mx-auto px-6 lg:px-10 py-10 flex flex-wrap gap-8 justify-between items-start">
          <div className="flex items-center gap-2.5">
            <Logomark className="w-5 h-5 text-brand" />
            <span className="font-display text-display-s text-sm">ReplayCoach</span>
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

const howItWorks = [
  {
    step: '01',
    title: 'Go live',
    body: 'Start a room, athletes join from any device, the skeleton overlay tracks in real time.',
    visual: <LiveTile />,
    icon: <BroadcastIcon className="w-5 h-5 text-brand" />,
  },
  {
    step: '02',
    title: 'Catch the moment',
    body: 'Hit replay the instant something looks off — the last 30 seconds are always buffered.',
    visual: <ReplayScrubberMini className="max-w-[220px]" />,
    icon: <RewindIcon className="w-5 h-5 text-brand" />,
  },
  {
    step: '03',
    title: 'Show the fix',
    body: 'Scrub frame by frame, draw over the play, and send the clip to the athlete\'s library.',
    visual: <AnnotationDrawDemo />,
    icon: <AnnotateIcon className="w-5 h-5 text-brand" />,
  },
];

/** Layered-stack hero visual — one athlete tile at real scale with the
 * signature joint motif, tilted with a second card peeking out behind it
 * (physical logic per design/DESIGN_SYSTEM.md §8.2, replacing the old flat
 * two-tile mock). */
function HeroMock() {
  return (
    <div aria-hidden className="relative animate-settle mx-auto max-w-md lg:max-w-none" style={{ transform: 'rotate(-2deg)' }}>
      <div
        className="absolute -right-6 -bottom-6 w-full h-full bg-panel-2 border border-hairline rounded-lg"
        style={{ transform: 'rotate(5deg)' }}
      />
      <div className="relative bg-panel border border-hairline rounded-lg p-4 shadow-lg">
        <div className="relative bg-panel-2 border border-hairline rounded-md aspect-[4/3] overflow-hidden flex items-end p-2">
          <SkeletonMotif className="absolute inset-0 w-full h-full p-6" jointColor="session" />
          <span className="relative text-xs text-ink bg-panel/80 backdrop-blur-sm rounded-full px-2.5 py-1 border border-hairline">
            Priya N. — Sprint mechanics
          </span>
        </div>
        <div className="mt-3 bg-panel-2 border border-hairline rounded-sm p-3">
          <div className="relative h-1 bg-replay/15 rounded-full mb-2">
            <div className="absolute left-0 top-0 bottom-0 w-[38%] bg-replay/40 rounded-full" />
            <div className="absolute left-[38%] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-replay" />
          </div>
          <div className="flex justify-between font-mono text-xs text-replay">
            <span>◍ 00:11.4 / 00:30.0</span>
            <span className="text-ink-faint">0.5×</span>
          </div>
        </div>
      </div>
      <div className="absolute -top-4 -right-4 flex items-center gap-1.5 bg-panel border border-hairline rounded-full pl-2.5 pr-3.5 py-1.5 font-mono text-xs text-ink shadow-md">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-session animate-ping opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-session" />
        </span>
        HIP_R <span className="text-session">168°</span>
      </div>
    </div>
  );
}
