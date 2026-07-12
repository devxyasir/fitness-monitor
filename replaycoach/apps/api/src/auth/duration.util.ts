const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parses a duration string like '15m', '7d', '12h', '30s' into milliseconds.
 * Falls back to `fallbackMs` on anything that doesn't match (including bare
 * numbers, which previously silently meant "this many days" regardless of
 * the value's actual unit — e.g. '12h' was misparsed as 12 days).
 */
export function parseDurationMs(value: string, fallbackMs: number): number {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(value.trim());
  if (!match) return fallbackMs;
  const amount = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  return amount * UNIT_MS[unit]!;
}
