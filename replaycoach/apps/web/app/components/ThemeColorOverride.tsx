'use client';

import { useEffect, useState } from 'react';
import type { ThemeSettings } from '@replaycoach/types';
import { systemSettingsClient } from '../../lib/system-settings-client';
import { useThemeStore } from '../../stores/theme-store';

/** Applies platform_admin-configured brand colors (see /admin/settings) on
 * top of the CSS-baked-in defaults — fetched once, then re-applied any time
 * the light/dark toggle flips (each theme has its own color set, and an
 * inline style override on <html> would otherwise win over BOTH the dark
 * default and the light [data-theme="light"] stylesheet rule regardless of
 * which is actually active, so this has to track the toggle itself rather
 * than set-and-forget). No fetched settings yet, or the admin never
 * customized anything → no-op, CSS defaults stand untouched. */
export function ThemeColorOverride() {
  const [settings, setSettings] = useState<ThemeSettings | null>(null);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    systemSettingsClient
      .getPublicTheme()
      .then(setSettings)
      .catch(() => {
        // Not fatal — CSS defaults already render correctly with zero JS.
      });
  }, []);

  useEffect(() => {
    if (!settings) return;
    const colors = theme === 'dark' ? settings.dark : settings.light;
    const root = document.documentElement.style;
    root.setProperty('--color-brand', hexToRgbTriplet(colors.brand));
    root.setProperty('--color-session', hexToRgbTriplet(colors.session));
    root.setProperty('--color-analytics', hexToRgbTriplet(colors.analytics));
  }, [settings, theme]);

  return null;
}

function hexToRgbTriplet(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '0 0 0';
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)].join(' ');
}
