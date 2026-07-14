'use client';

import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore, type ToastVariant } from '../../stores/toast-store';

const VARIANT_STYLES: Record<ToastVariant, { className: string; icon: typeof Info }> = {
  error: { className: 'bg-danger/10 border-danger/30 text-danger', icon: AlertTriangle },
  success: { className: 'bg-live/10 border-live/30 text-live', icon: CheckCircle2 },
  info: { className: 'bg-panel border-hairline text-ink', icon: Info },
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2.5 max-w-[calc(100vw-2.5rem)] sm:max-w-sm">
      {toasts.map((t) => {
        const cfg = VARIANT_STYLES[t.variant];
        const Icon = cfg.icon;
        return (
          <div
            key={t.id}
            role="alert"
            className={`flex items-start gap-2.5 border rounded-lg px-4 py-3 shadow-2xl backdrop-blur-glass animate-rise text-sm ${cfg.className}`}
          >
            <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1 min-w-0">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
