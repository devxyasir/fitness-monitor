'use client';

import { useEffect, useRef } from 'react';

export default function DemoVideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      videoRef.current?.play().catch(() => {});
    } else {
      videoRef.current?.pause();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Product demo video"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 animate-rise"
      onClick={onClose}
    >
      <div aria-hidden className="absolute inset-0 bg-canvas/85 backdrop-blur-md" />

      <div
        className="relative w-full max-w-4xl animate-settle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative rounded-lg overflow-hidden border border-hairline bg-panel shadow-2xl" style={{ boxShadow: '0 24px 80px -20px rgba(99,102,241,0.35)' }}>
          <video
            ref={videoRef}
            src="/media/demo.mp4"
            controls
            playsInline
            className="w-full aspect-video bg-black block"
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close demo video"
          className="absolute -top-4 -right-4 w-9 h-9 rounded-full bg-panel border border-hairline flex items-center justify-center text-ink hover:bg-panel-2 transition-colors shadow-lg"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
