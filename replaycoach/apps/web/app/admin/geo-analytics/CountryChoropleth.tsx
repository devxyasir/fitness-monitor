'use client';

import { useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import type { GeoCountryStat } from '@replaycoach/types';
import { alpha2ForNumericCode } from '../../../lib/iso-numeric-countries';
import { countryNameForCode } from '../../../lib/iso-countries';

const GEO_URL = '/world-countries-110m.json';
const BASE_FILL = 'rgb(var(--color-panel-2))';
const STROKE = 'rgb(var(--color-canvas))';
const MIN_OPACITY = 0.15;

interface HoverState {
  code: string;
  count: number;
  x: number;
  y: number;
}

/** Colors countries via a sequential opacity ramp on the single
 * --color-analytics accent (not a hue scale) — per the geo-analytics page's
 * requirement to read as part of this app's own design system. Fed by the
 * same top-10-by-volume list as the bar chart (see geo-stats.service.ts);
 * countries outside that top 10 render as "no data", not a hidden zero. */
export function CountryChoropleth({ data }: { data: GeoCountryStat[] }) {
  const [hovered, setHovered] = useState<HoverState | null>(null);
  const maxCount = data.reduce((max, d) => Math.max(max, d.count), 0);
  const byCode = new Map(data.map((d) => [d.countryCode, d.count]));

  const opacityFor = (count: number) => {
    if (maxCount <= 0) return MIN_OPACITY;
    return MIN_OPACITY + (count / maxCount) * (1 - MIN_OPACITY);
  };

  return (
    <div className="relative">
      <ComposableMap projectionConfig={{ scale: 128 }} style={{ width: '100%', height: 'auto' }}>
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const numericId = String(geo.id).padStart(3, '0');
              const alpha2 = alpha2ForNumericCode(numericId);
              const count = alpha2 ? byCode.get(alpha2) : undefined;
              const fill = count ? `rgb(var(--color-analytics) / ${opacityFor(count)})` : BASE_FILL;

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke={STROKE}
                  strokeWidth={0.5}
                  tabIndex={count ? 0 : -1}
                  onMouseEnter={(evt) => {
                    if (alpha2 && count) setHovered({ code: alpha2, count, x: evt.clientX, y: evt.clientY });
                  }}
                  onMouseMove={(evt) => {
                    setHovered((prev) => (prev ? { ...prev, x: evt.clientX, y: evt.clientY } : prev));
                  }}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => {
                    if (alpha2 && count) setHovered({ code: alpha2, count, x: 0, y: 0 });
                  }}
                  onBlur={() => setHovered(null)}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none', filter: count ? 'brightness(1.2)' : undefined, cursor: count ? 'pointer' : 'default' },
                    pressed: { outline: 'none' },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      {hovered && (
        <div
          className="fixed z-50 pointer-events-none bg-panel border border-hairline shadow-md rounded-md px-3 py-2 text-xs"
          style={{ left: hovered.x + 14, top: hovered.y + 14 }}
        >
          <div className="font-mono font-semibold text-ink">{countryNameForCode(hovered.code)}</div>
          <div className="text-ink-muted">{hovered.count.toLocaleString()} checks</div>
        </div>
      )}
    </div>
  );
}
