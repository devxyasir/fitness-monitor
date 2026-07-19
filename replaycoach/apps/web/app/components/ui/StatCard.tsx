import type { LucideIcon } from 'lucide-react';
import { Card } from './Card';

type StatCardAccent = 'brand' | 'session' | 'analytics' | 'success' | 'danger' | 'replay';

// Tailwind's JIT scanner needs statically-visible class names — a template
// literal like `bg-${accent}/10` isn't detectable, so every accent's full
// class strings are spelled out here (mirrors Card.tsx's ACCENT_CLASSES).
const ICON_WRAP_CLASSES: Record<StatCardAccent, string> = {
  brand: 'bg-brand/10',
  session: 'bg-session/10',
  analytics: 'bg-analytics/10',
  success: 'bg-success/10',
  danger: 'bg-danger/10',
  replay: 'bg-replay/10',
};

const ICON_CLASSES: Record<StatCardAccent, string> = {
  brand: 'text-brand',
  session: 'text-session',
  analytics: 'text-analytics',
  success: 'text-success',
  danger: 'text-danger',
  replay: 'text-replay',
};

/** Shared KPI tile — the platform dashboard and the geo-analytics dashboard
 * render identical stat cards rather than two hand-rolled copies. */
export function StatCard({
  icon: Icon,
  label,
  value,
  accent = 'analytics',
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  accent?: StatCardAccent;
}) {
  return (
    <Card accent={accent} className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 ${ICON_WRAP_CLASSES[accent]}`}>
        <Icon className={`w-5 h-5 ${ICON_CLASSES[accent]}`} />
      </div>
      <div>
        <div className="text-xl font-mono font-bold text-ink">{value}</div>
        <div className="text-xs text-ink-muted">{label}</div>
      </div>
    </Card>
  );
}
