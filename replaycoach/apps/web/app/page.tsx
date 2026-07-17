'use client';

import Link from 'next/link';
import { useState } from 'react';
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
  DancerSkeletonOverlay,
} from './components/LandingVisuals';
import { Plus } from 'lucide-react';
import { BroadcastIcon, RewindIcon, AnnotateIcon, TrackingIcon, SquadIcon } from './components/icons';
import { Button } from './components/ui/Button';
import { UserMenu } from './components/UserMenu';

export default function LandingPage() {
  const { user } = useAuthStore();
  const [demoOpen, setDemoOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-canvas text-ink relative overflow-hidden">
      {/* Nav */}
      <header className="sticky top-0 z-20 bg-panel/85 backdrop-blur-md border-b border-hairline">
        <div className="max-w-content mx-auto px-6 lg:px-10 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logomark className="w-6 h-6 text-brand" />
            <span className="font-display text-display-s">LetsMove</span>
          </div>
          <nav className="hidden md:flex items-center gap-7">
            <a href="#product" className="text-ink-muted text-sm hover:text-ink transition-colors">Product</a>
            <a href="#how" className="text-ink-muted text-sm hover:text-ink transition-colors">How It Works</a>
            <a href="#for-dancers" className="text-ink-muted text-sm hover:text-ink transition-colors">For Dancers</a>
            <a href="#for-coaches" className="text-ink-muted text-sm hover:text-ink transition-colors">For Coaches</a>
            <a href="#features" className="text-ink-muted text-sm hover:text-ink transition-colors">Features</a>
            <a href="#faq" className="text-ink-muted text-sm hover:text-ink transition-colors">FAQs</a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user ? (
              <UserMenu showDashboardLink />
            ) : (
              <>
                <Link href="/login" className="text-sm font-semibold text-ink border border-hairline rounded-full px-5 py-2.5 hover:bg-panel-2 transition-colors">
                  Log in
                </Link>
                <Button href="/register" size="md">Join the Beta</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative max-w-content mx-auto px-6 lg:px-10 pt-24 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-14 items-center">
          <div className="animate-rise">
            <div className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4">Movement Review for Dance</div>
            <h1 className="font-display text-display-xl text-ink mb-5 text-balance">
              See how your body moves.
            </h1>
            <p className="text-ink-muted text-body-l max-w-md mb-8">
              Record, track and review every movement in one focused space. Study your timing, alignment and execution—alone or together with your coach.
            </p>
            <div className="flex gap-3.5 flex-wrap">
              <Button href="/register" size="lg">Start Tracking</Button>
              <Button variant="ghost" size="lg" onClick={() => setDemoOpen(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
                See How It Works
              </Button>
            </div>
            <p className="text-ink-faint text-xs mt-5 font-mono tracking-wide">Built for dancers, choreographers, instructors and studios.</p>
          </div>

          <HeroMock />
        </div>
      </section>

      {/* Introductory statement */}
      <section className="relative max-w-content mx-auto px-6 lg:px-10 py-16 border-t border-hairline">
        <Reveal>
          <div className="max-w-2xl">
            <span className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4 block">Movement Happens Fast</span>
            <h2 className="font-display text-display-l text-ink mb-5 text-balance">
              Dance is felt in the moment. Progress begins when you can see it clearly.
            </h2>
            <p className="text-ink-muted text-body-m max-w-lg">
              A transition can last less than a second, but it can change an entire performance. Review your movement in detail, return to important moments and understand what needs to change in the next take.
            </p>
          </div>
        </Reveal>
      </section>

      {/* How it works */}
      <section id="how" className="relative max-w-content mx-auto px-6 lg:px-10 py-20 border-t border-hairline">
        <Reveal>
          <h2 className="font-display text-display-l text-ink mb-4">From movement to meaningful feedback.</h2>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-10">
          {howItWorks.map((s, i) => (
            <Reveal key={s.step} delayMs={i * 80}>
              <div>
                <div className="aspect-video flex items-center">{s.visual}</div>
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

      {/* Feature bands — Movement tracking, Live Review, Rooms */}
      <section id="product" className="relative max-w-content mx-auto px-6 lg:px-10 py-24 space-y-24">
        {/* Movement Tracking (session, photo left) */}
        <Reveal>
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
            <div className="relative w-full lg:w-[45%] aspect-[4/5] rounded-lg overflow-hidden shadow-xl hover:-translate-y-1 hover:shadow-xl transition-all duration-200">
              <BandPhoto
                src="/images/landing/signature-athlete.jpg"
                alt="A dancer mid-movement with body tracking overlay"
                className="absolute inset-0 w-full h-full"
              />
              <DancerSkeletonOverlay className="absolute inset-0 w-full h-full" />
            </div>
            <div className="flex-1">
              <TrackingIcon className="w-8 h-8 text-session mb-4" />
              <span className="font-mono text-xs text-session uppercase tracking-widest">Movement Tracking</span>
              <h3 className="font-display text-display-m text-ink mt-3 mb-3">Understand more than the final pose.</h3>
              <p className="text-ink-muted text-body-m max-w-md">
                Dance is built through transitions, timing, balance and control. Movement tracking helps you study what happened between positions—not only where the movement started and ended.
              </p>
              <JointReadout />
            </div>
          </div>
        </Reveal>

        {/* Frame-by-Frame Review (replay, photo right) */}
        <Reveal>
          <div className="flex flex-col lg:flex-row-reverse items-center gap-10 lg:gap-16">
            <div className="relative w-full lg:w-[55%] aspect-video rounded-lg overflow-hidden shadow-xl hover:-translate-y-1 hover:shadow-xl transition-all duration-200">
              <BandPhoto
                src="/images/landing/replay-scrub.jpg"
                alt="Frame-by-frame review of dance transitions"
                className="absolute inset-0 w-full h-full"
              />
              <div className="absolute top-6 right-6 w-60 rounded-md overflow-hidden border border-hairline shadow-lg">
                <ReplayScrubberMini />
              </div>
            </div>
            <div className="flex-1">
              <RewindIcon className="w-8 h-8 text-replay mb-4" />
              <span className="font-mono text-xs text-replay uppercase tracking-widest">Frame-by-Frame</span>
              <h3 className="font-display text-display-m text-ink mt-3 mb-3">Slow down fast combinations</h3>
              <p className="text-ink-muted text-body-m max-w-md">Slow down important transitions and technical details. The last 30 seconds are always buffered — review the instant something needs attention.</p>
            </div>
          </div>
        </Reveal>

        {/* Live Dance Room (analytics, photo left) */}
        <Reveal>
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
            <div className="relative w-full lg:w-[50%] aspect-[4/3] rounded-lg overflow-hidden shadow-xl hover:-translate-y-1 hover:shadow-xl transition-all duration-200">
              <BandPhoto
                src="/images/landing/rooms-squad.jpg"
                alt="Dancers and choreographer reviewing performance together"
                className="absolute inset-0 w-full h-full"
              />
              <div className="absolute bottom-6 right-6 bg-panel/90 backdrop-blur-glass border border-hairline rounded-md shadow-lg p-3">
                <RoomsGridMini className="w-32" />
              </div>
            </div>
            <div className="flex-1">
              <SquadIcon className="w-8 h-8 text-analytics mb-4" />
              <span className="font-mono text-xs text-analytics uppercase tracking-widest">Live Dance Room</span>
              <h3 className="font-display text-display-m text-ink mt-3 mb-3">Review movement as it happens</h3>
              <p className="text-ink-muted text-body-m max-w-md">Review performances with dancers, coaches and choreographers in real time. One room, one cued take, everyone watching the same moment at once.</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Live review — the page's single largest photographic moment */}
      <section className="relative w-full py-16 lg:py-24">
        <Reveal>
          <div className="relative w-full aspect-[4/5] lg:aspect-[21/9] overflow-hidden rounded-lg lg:rounded-none">
            <BandPhoto
              src="/images/landing/editorial-review.jpg"
              alt="A dancer and coach reviewing movement footage together"
              className="absolute inset-0 w-full h-full"
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(90deg, rgb(var(--color-canvas) / 0.9), rgb(var(--color-canvas) / 0.4) 55%, rgb(var(--color-canvas) / 0.12))' }}
            />
            <div className="absolute inset-0 flex items-center">
              <div className="max-w-content mx-auto px-6 lg:px-10 w-full">
                <div className="max-w-lg">
                  <span className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4 block">The Dance Room</span>
                  <p className="font-display text-display-l text-ink text-balance">
                    Review every take together, live, while the movement is still fresh.
                  </p>
                  <p className="text-ink-muted text-body-m mt-4 max-w-md">
                    Pause, replay and discuss the precise moment where feedback belongs. No separate meeting and no relying on memory.
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
            <div className="relative aspect-video bg-panel-2">
              <video
                src="/media/demo.mp4"
                muted
                playsInline
                preload="metadata"
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover"
                onLoadedMetadata={(e) => {
                  e.currentTarget.currentTime = 2;
                }}
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgb(var(--color-canvas) / 0.15), rgb(var(--color-canvas) / 0.6))' }} />
              <span className="absolute top-5 left-6 font-mono text-xs tracking-[0.14em] text-brand uppercase">Product demo</span>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center justify-center w-20 h-20 rounded-full bg-brand group-hover:scale-105 transition-transform duration-200">
                  <svg width="26" height="26" viewBox="0 0 24 24" className="fill-white dark:fill-canvas" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
              <span className="absolute bottom-6 left-6 right-6 font-display text-display-s text-ink">
                Watch a live dance review session — movement tracking, frame-by-frame playback and coach notes in real time.
              </span>
            </div>
          </button>
        </Reveal>
      </section>

      <DemoVideoModal open={demoOpen} onClose={() => setDemoOpen(false)} />

      {/* Everything needed to study movement clearly */}
      <section id="features" className="relative max-w-content mx-auto px-6 lg:px-10 py-20 border-t border-hairline">
        <Reveal>
          <h2 className="font-display text-display-l text-ink mb-10">Everything needed to study movement clearly.</h2>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuresList.map((f, i) => (
            <Reveal key={f.title} delayMs={i * 60}>
              <div className="bg-panel border border-hairline rounded-lg p-6 hover:-translate-y-1 hover:shadow-lg transition-all duration-200">
                <h3 className="font-display text-display-s text-ink mb-2">{f.title}</h3>
                <p className="text-ink-muted text-sm leading-relaxed">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* For Dancers */}
      <section id="for-dancers" className="relative max-w-content mx-auto px-6 lg:px-10 py-20 border-t border-hairline">
        <Reveal>
          <span className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4 block">For Dancers</span>
          <h2 className="font-display text-display-l text-ink mb-5">Practise with greater awareness.</h2>
          <p className="text-ink-muted text-body-m max-w-lg mb-10">
            See what happened during your movement instead of depending only on how it felt. Review your timing, transitions, alignment and control before returning to the studio floor.
          </p>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {forDancers.map((item, i) => (
            <Reveal key={item.title} delayMs={i * 60}>
              <div className="bg-panel border border-hairline rounded-lg p-6 hover:-translate-y-1 hover:shadow-lg transition-all duration-200">
                <h3 className="font-display text-display-s text-ink mb-2">{item.title}</h3>
                <p className="text-ink-muted text-sm leading-relaxed">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-8">
          <Button href="/register" size="lg">Track Your Movement</Button>
        </div>
      </section>

      {/* For Coaches and Choreographers */}
      <section id="for-coaches" className="relative max-w-content mx-auto px-6 lg:px-10 py-20 border-t border-hairline">
        <Reveal>
          <span className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4 block">For Coaches and Choreographers</span>
          <h2 className="font-display text-display-l text-ink mb-5">Give feedback dancers can see.</h2>
          <p className="text-ink-muted text-body-m max-w-lg mb-10">
            Move beyond general comments. Show dancers the precise moment where timing, alignment, energy or execution needs attention.
          </p>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {forCoaches.map((item, i) => (
            <Reveal key={item.title} delayMs={i * 60}>
              <div className="bg-panel border border-hairline rounded-lg p-6 hover:-translate-y-1 hover:shadow-lg transition-all duration-200">
                <h3 className="font-display text-display-s text-ink mb-2">{item.title}</h3>
                <p className="text-ink-muted text-sm leading-relaxed">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-8">
          <Button href="/register" size="lg">Open a Dance Room</Button>
        </div>
      </section>

      {/* Comparison — Compare Takes */}
      <section className="relative max-w-content mx-auto px-6 lg:px-10 py-20 border-t border-hairline">
        <Reveal>
          <span className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4 block">Compare Takes</span>
          <h2 className="font-display text-display-l text-ink mb-5 max-w-2xl text-balance">
            See what changed—not just what felt different.
          </h2>
          <p className="text-ink-muted text-body-m max-w-lg mb-8">
            Place two takes side by side to compare timing, positioning, energy and movement pathways. Turn subtle differences into visible information.
          </p>
        </Reveal>
        <Reveal delayMs={80}>
          <div className="flex flex-wrap gap-2.5">
            {['Take 01', 'Take 02', 'Reference Performance', 'Compare Movement', 'Sync Playback', 'Add Coach Note'].map((label) => (
              <span key={label} className="font-mono text-xs text-ink-muted bg-panel-2 border border-hairline rounded-full px-3.5 py-1.5">
                {label}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Collaboration — Review Together */}
      <section className="relative max-w-content mx-auto px-6 lg:px-10 py-20 border-t border-hairline">
        <Reveal>
          <div className="max-w-2xl">
            <span className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4 block">Review Together</span>
            <h2 className="font-display text-display-l text-ink mb-5 text-balance">
              The rehearsal and the review belong in the same room.
            </h2>
            <p className="text-ink-muted text-body-m max-w-lg mb-8">
              Invite a dancer, teacher or choreographer into a shared review session. Watch the footage, pause important moments and discuss improvements while everyone sees the same movement.
            </p>
            <Button href="/register" size="lg">Start a Live Review</Button>
          </div>
        </Reveal>
      </section>

      {/* Progress — Movement History */}
      <section className="relative max-w-content mx-auto px-6 lg:px-10 py-20 border-t border-hairline">
        <Reveal>
          <span className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4 block">Movement History</span>
          <h2 className="font-display text-display-l text-ink mb-5 max-w-2xl text-balance">
            Your development should be visible.
          </h2>
          <p className="text-ink-muted text-body-m max-w-lg mb-8">
            Keep rehearsals, performances and feedback organised over time. Return to previous takes and see how your movement develops from one session to the next.
          </p>
        </Reveal>
        <Reveal delayMs={80}>
          <div className="flex flex-wrap gap-2.5">
            {['Recent Sessions', 'Saved Takes', 'Coach Feedback', 'Movement Comparisons', 'Rehearsal History', 'Performance Milestones'].map((label) => (
              <span key={label} className="font-mono text-xs text-ink-muted bg-panel-2 border border-hairline rounded-full px-3.5 py-1.5">
                {label}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Use Cases */}
      <section className="relative max-w-content mx-auto px-6 lg:px-10 py-20 border-t border-hairline">
        <Reveal>
          <h2 className="font-display text-display-l text-ink mb-10">Built for every stage of dance development.</h2>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {useCases.map((uc, i) => (
            <Reveal key={uc.title} delayMs={i * 60}>
              <div className="bg-panel border border-hairline rounded-lg p-6 hover:-translate-y-1 hover:shadow-lg transition-all duration-200">
                <h3 className="font-display text-display-s text-ink mb-2">{uc.title}</h3>
                <p className="text-ink-muted text-sm leading-relaxed">{uc.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Philosophy */}
      <section className="relative max-w-content mx-auto px-6 lg:px-10 py-20 border-t border-hairline">
        <Reveal>
          <div className="max-w-2xl">
            <span className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4 block">More Than Fitness</span>
            <h2 className="font-display text-display-l text-ink mb-5">Dance is not a collection of repetitions.</h2>
            <p className="text-ink-muted text-body-m max-w-lg">
              It is timing, expression, intention, control and movement through space. The platform is designed to help dancers study the complete performance—not simply count how many times a movement was completed.
            </p>
          </div>
        </Reveal>
      </section>

      {/* FAQs */}
      <section id="faq" className="relative max-w-content mx-auto px-6 lg:px-10 py-20 border-t border-hairline">
        <Reveal>
          <h2 className="font-display text-display-l text-ink mb-10">Frequently asked questions</h2>
        </Reveal>
        <div className="max-w-2xl border-t border-hairline">
          {faqs.map((faq, i) => (
            <FaqAccordionItem key={i} q={faq.q} a={faq.a} isOpen={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative border-t border-hairline">
        <div className="max-w-content mx-auto px-6 lg:px-10 py-20 text-center">
          <span className="font-mono text-xs tracking-[0.14em] text-brand uppercase mb-4 block">Move. Review. Refine.</span>
          <h2 className="font-display text-display-l text-ink mb-5">Turn every rehearsal into a clearer next step.</h2>
          <p className="text-ink-muted text-body-m max-w-md mx-auto mb-8">
            Record your movement, review the details and return to the floor with greater awareness.
          </p>
          <div className="flex gap-3.5 flex-wrap justify-center">
            <Button href="/register" size="lg">Start Tracking Movement</Button>
            <Button href="/register" variant="ghost" size="lg">Join the Beta</Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-hairline">
        <div className="max-w-content mx-auto px-6 lg:px-10 py-10 flex flex-wrap gap-8 justify-between items-start">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <Logomark className="w-5 h-5 text-brand" />
              <span className="font-display text-display-s text-sm">LetsMove</span>
            </div>
            <p className="text-ink-faint text-xs max-w-xs">Movement review for dancers, choreographers, instructors and studios.</p>
          </div>
          <div className="flex gap-12 flex-wrap">
            <FooterCol title="Product" links={['Product', 'How It Works', 'Features']} />
            <FooterCol title="For" links={['For Dancers', 'For Coaches']} />
            <FooterCol title="Legal" links={['Privacy', 'Terms', 'Contact']} />
          </div>
          <div className="font-mono text-xs text-ink-faint">Powered by MorangoAi</div>
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
    title: 'Record a take',
    body: 'Capture a short combination, dance phrase, rehearsal or complete performance.',
    visual: <LiveTile />,
    icon: <BroadcastIcon className="w-5 h-5 text-brand" />,
  },
  {
    step: '02',
    title: 'Track the movement',
    body: 'Follow how your body moves through space and return to the exact moments that matter.',
    visual: <ReplayScrubberMini className="max-w-[220px]" />,
    icon: <RewindIcon className="w-5 h-5 text-brand" />,
  },
  {
    step: '03',
    title: 'Review and refine',
    body: 'Study your performance independently or review it live with an instructor, choreographer or coach.',
    visual: <AnnotationDrawDemo />,
    icon: <AnnotateIcon className="w-5 h-5 text-brand" />,
  },
];

const featuresList = [
  { title: 'Movement Tracking', body: 'Follow how the body changes position throughout a dance sequence.' },
  { title: 'Frame-by-Frame Playback', body: 'Slow down fast combinations and examine transitions in detail.' },
  { title: 'Live Dance Room', body: 'Review performances with dancers, coaches and choreographers in real time.' },
  { title: 'Side-by-Side Comparison', body: 'Compare different takes or place a dancer\'s performance beside a reference.' },
  { title: 'Timestamped Feedback', body: 'Connect each comment to the exact moment it addresses.' },
  { title: 'Practice History', body: 'Organise previous sessions and review development over time.' },
];

const forDancers = [
  { title: 'Study difficult combinations', body: 'Break complex choreography into clearer moments.' },
  { title: 'Compare different takes', body: 'See what changed between one performance and the next.' },
  { title: 'Keep feedback organised', body: 'Return to previous notes without searching through messages and videos.' },
  { title: 'Understand your progress', body: 'Build a visible record of your development across rehearsals.' },
];

const forCoaches = [
  { title: 'Review performances remotely', body: 'Provide structured feedback without requiring another studio session.' },
  { title: 'Connect notes to movement', body: 'Place comments directly beside the relevant moment.' },
  { title: 'Compare interpretation and execution', body: 'Review how choreography changes between demonstrations and performances.' },
  { title: 'Build a clearer learning process', body: 'Give dancers feedback they can revisit before their next rehearsal.' },
];

const useCases = [
  { title: 'Solo Practice', body: 'Review combinations and performances between studio sessions.' },
  { title: 'Dance Classes', body: 'Help students understand corrections through visible examples.' },
  { title: 'Choreography Development', body: 'Compare interpretations and refine movement choices.' },
  { title: 'Remote Coaching', body: 'Review and discuss movement without being in the same location.' },
  { title: 'Audition Preparation', body: 'Study performance details before submitting or attending an audition.' },
  { title: 'Studio Training', body: 'Maintain structured feedback across classes, teams and productions.' },
];

const faqs = [
  { q: 'Is the platform only for professional dancers?', a: 'No. It can support students, emerging dancers, professional performers, instructors and choreographers.' },
  { q: 'Which dance styles can be reviewed?', a: 'The platform is designed around body movement rather than one specific dance style, making it suitable for different forms of dance and movement practice.' },
  { q: 'Does it replace a dance instructor?', a: 'No. It gives instructors and dancers a clearer way to review, communicate and revisit feedback.' },
  { q: 'Can I compare multiple performances?', a: 'Where comparison is enabled, different takes can be reviewed together to identify changes in timing, positioning and execution.' },
  { q: 'Can an instructor review a session remotely?', a: 'Live or shared review tools can allow dancers and instructors to examine the same performance without being in the same studio.' },
  { q: 'Is special equipment required?', a: 'No specialised hardware — a device with a camera, a microphone and a modern browser is enough to join a live session. Movement tracking runs on our servers, not on your device, so performance depends on your camera quality and internet connection rather than local processing power.' },
  { q: 'Is my footage private?', a: 'Yes. Recordings and clips are stored privately and only reachable through time-limited, signed links — never a public URL. A clip is visible only to the coach who created it and whoever they explicitly share it with; nothing is visible to other students or outside your organization by default.' },
];

/** Single-open accordion item — expanding one collapses whichever else was
 * open (state lives in the parent; this is purely presentational). Height
 * animates via a CSS grid-template-rows 0fr→1fr transition, which animates
 * smoothly without ever needing a measured pixel height in JS. */
function FaqAccordionItem({ q, a, isOpen, onToggle }: { q: string; a: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-hairline">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <h3 className="font-display text-display-s text-ink group-hover:text-brand transition-colors">{q}</h3>
        <Plus className={`w-5 h-5 text-ink-faint flex-shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-45 text-brand' : ''}`} />
      </button>
      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}>
        <div className="overflow-hidden">
          <p className="text-ink-muted text-sm leading-relaxed pb-5 max-w-xl">{a}</p>
        </div>
      </div>
    </div>
  );
}

/** Layered-stack hero visual — one dancer tile at real scale with the
 * signature joint motif, tilted with a second card peeking out behind it */
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
            Maya R. — Contemporary sequence
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
