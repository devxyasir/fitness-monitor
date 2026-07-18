'use client';

import { useEffect, useState } from 'react';
import { MapPin, Mail } from 'lucide-react';
import { geoClient } from '../../lib/geo-client';
import { countryNameForCode } from '../../lib/iso-countries';
import { Logomark } from '../components/Logomark';
import { Button } from '../components/ui/Button';

/**
 * The blocked-visitor page — reached via apps/web/middleware.ts's redirect
 * once POST /geo/check reports `allowed: false`. Deliberately re-runs its
 * own check on mount (cheap: geo-lookup.service.ts caches per-IP for ~1h)
 * rather than threading the result through the redirect — keeps this page
 * correct even if landed on directly, with no query-param plumbing.
 */
export default function ServiceUnavailablePage() {
  const [location, setLocation] = useState<{ country: string | null; countryCode: string | null; region: string | null; city: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    geoClient
      .check({})
      .then((res) => setLocation(res.location))
      .catch(() => setLocation(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-6 py-16">
      <div className="text-center max-w-md">
        <Logomark className="w-8 h-8 text-brand mx-auto mb-6" />
        <div className="w-14 h-14 rounded-full bg-danger/10 border border-danger/30 flex items-center justify-center mx-auto mb-6">
          <MapPin className="w-6 h-6 text-danger" />
        </div>
        <h1 className="font-display text-display-m text-ink mb-3">Service not available</h1>
        <p className="text-sm text-ink-muted leading-relaxed mb-6">
          Unfortunately, this service is currently unavailable in your region.
        </p>

        <div className="bg-panel border border-hairline rounded-lg p-5 text-left mb-8">
          <div className="text-[0.6875rem] font-mono uppercase tracking-widest text-ink-faint mb-3">Detected location</div>
          {loading ? (
            <div className="space-y-2">
              <div className="h-3.5 w-2/3 rounded-full bg-panel-2 animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-panel-2 via-panel to-panel-2" />
              <div className="h-3.5 w-1/2 rounded-full bg-panel-2 animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-panel-2 via-panel to-panel-2" />
            </div>
          ) : (
            <dl className="space-y-1.5 text-sm">
              <Row label="Country" value={location?.countryCode ? countryNameForCode(location.countryCode) : 'Unknown'} />
              <Row label="Region" value={location?.region || '—'} />
              <Row label="City" value={location?.city || '—'} />
            </dl>
          )}
        </div>

        <p className="text-xs text-ink-faint mb-5">
          If you believe this is incorrect, please contact support.
        </p>
        <Button href="mailto:support@morangoai.net" variant="ghost">
          <Mail className="w-3.5 h-3.5" /> Contact support
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink font-medium text-right">{value}</dd>
    </div>
  );
}
