'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { geoClient } from '../../lib/geo-client';
import { systemSettingsClient } from '../../lib/system-settings-client';
import { useAuthStore } from '../../stores/auth-store';
import { PageLoader } from './ui/PageLoader';
import { GeoPermissionExplainer, GeoPermissionDeniedModal } from './GeoPermissionModal';

type Phase = 'checking' | 'allowed' | 'blocked' | 'gps-explain' | 'gps-denied';

/**
 * Client-side geo gate, checked fresh on every route change — including the
 * public landing page. (An earlier version exempted `/` for SEO and cached
 * the decision in sessionStorage for 30 minutes; both were rolled back —
 * exempting `/` meant a blocked visitor could still see and use the
 * marketing site, and the cache meant an admin turning restriction ON
 * didn't actually take effect for anyone already holding a cached "allowed"
 * verdict, for up to 30 minutes. Neither is acceptable for an access-control
 * feature — every navigation now gets a real check against current
 * settings. The backend's own per-IP lookup cache (~1h, see
 * GeoLookupService) is what keeps this cheap, not a frontend cache.)
 *
 * Deliberately NOT implemented in apps/web/middleware.ts (Edge runtime):
 * middleware calling the API via fetch() would be a server-to-server
 * request, and the API would see the middleware process as the caller, not
 * the original visitor — correctly attributing that back to the real
 * visitor IP would need either a spoofable client-supplied override (a real
 * security hole on a public endpoint) or a shared-secret internal-call
 * mechanism, both more complexity/risk than this feature needs. A
 * client-side check calling the API directly has a simple, correct IP
 * chain (browser → nginx → API, single trusted hop — see main.ts's `trust
 * proxy` setting) with no relay problem at all. This mirrors what this
 * codebase already does for MaintenanceGate/AdminAuthGuard: middleware.ts
 * is explicitly documented as "a UX convenience only... NOT the security
 * boundary" — the real, unbypassable enforcement for this feature is
 * GeoAccessGuard on POST /auth/login and /auth/register (see
 * apps/api/src/geo/geo-access.guard.ts), which nothing here replaces.
 *
 * A blocked visitor is redirected to the full-page /service-unavailable
 * experience rather than shown a dismissable overlay on top of still-loaded
 * page content — a modal a visitor can close (or that a technically savvy
 * one could bypass via devtools) doesn't actually satisfy "don't let them
 * access the page"; replacing the page outright does.
 */
export function GeoAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();
  const [phase, setPhase] = useState<Phase>('checking');

  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  // /admin/* and an already-authenticated platform_admin stay exempt so an
  // admin can always reach the settings needed to turn restriction back off,
  // even from a location that would otherwise be blocked — same reasoning
  // MaintenanceGate already uses for its own admin bypass.
  const isExempt =
    pathname === '/service-unavailable' ||
    isAdminRoute ||
    user?.role === 'platform_admin';

  const finish = (allowed: boolean) => {
    if (allowed) {
      setPhase('allowed');
    } else {
      setPhase('blocked');
      router.replace('/service-unavailable');
    }
  };

  const runIpCheck = () => {
    geoClient
      .check({})
      .then((res) => finish(res.allowed))
      .catch(() => setPhase('allowed')); // outage → fail open, never trap a legitimate visitor
  };

  const runGpsCheck = (lat: number, lon: number) => {
    geoClient
      .check({ lat, lon })
      .then((res) => finish(res.allowed))
      .catch(() => setPhase('allowed'));
  };

  // fallbackToIp/strictMode from the last status fetch — read in
  // handleGpsDenied, stashed here since the geolocation callback fires
  // asynchronously well after the initial status check.
  const [gpsFallback, setGpsFallback] = useState({ fallbackToIp: true, strictMode: false });

  const handleGpsDenied = () => {
    if (gpsFallback.strictMode) {
      finish(false);
    } else if (gpsFallback.fallbackToIp) {
      runIpCheck();
    } else {
      setPhase('gps-denied');
    }
  };

  const requestGpsPosition = () => {
    if (!navigator.geolocation) {
      handleGpsDenied();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => runGpsCheck(pos.coords.latitude, pos.coords.longitude),
      () => handleGpsDenied(),
      { timeout: 10000 },
    );
  };

  useEffect(() => {
    if (isExempt) {
      setPhase('allowed');
      return;
    }

    setPhase('checking');
    let cancelled = false;
    systemSettingsClient
      .getPublicStatus()
      .then((s) => {
        if (cancelled) return;
        if (!s.geoEnabled) {
          setPhase('allowed');
          return;
        }
        setGpsFallback({ fallbackToIp: s.geoFallbackToIp, strictMode: s.geoStrictMode });
        if (s.geoDetectionMethod === 'gps') {
          setPhase('gps-explain');
        } else {
          runIpCheck();
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('allowed'); // can't even read settings — fail open
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isExempt]);

  if (isExempt || phase === 'allowed') {
    return <>{children}</>;
  }

  if (phase === 'checking') {
    return <PageLoader label="Checking availability…" />;
  }

  if (phase === 'gps-explain') {
    return (
      <>
        <PageLoader label="Detecting location…" />
        <GeoPermissionExplainer onAllow={requestGpsPosition} onCancel={handleGpsDenied} />
      </>
    );
  }

  if (phase === 'gps-denied') {
    return (
      <>
        <PageLoader label="Detecting location…" />
        <GeoPermissionDeniedModal onRetry={requestGpsPosition} onClose={handleGpsDenied} />
      </>
    );
  }

  // 'blocked' — redirect already in flight.
  return null;
}
