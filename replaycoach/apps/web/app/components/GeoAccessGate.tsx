'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { geoClient } from '../../lib/geo-client';
import { systemSettingsClient } from '../../lib/system-settings-client';
import { useAuthStore } from '../../stores/auth-store';
import { PageLoader } from './ui/PageLoader';
import { GeoPermissionExplainer, GeoPermissionDeniedModal } from './GeoPermissionModal';

type Phase = 'checking' | 'allowed' | 'blocked' | 'gps-explain' | 'gps-denied';

const CACHE_KEY = 'geo_access_status';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — bounds how stale a decision can get after an admin changes settings

interface CachedDecision {
  allowed: boolean;
  expiresAt: number;
}

function readCache(): CachedDecision | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDecision;
    return parsed.expiresAt > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(allowed: boolean): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ allowed, expiresAt: Date.now() + CACHE_TTL_MS }));
  } catch {
    // Storage unavailable (private browsing, quota) — just re-checks next time.
  }
}

/**
 * Client-side geo gate, checked on every route change — including the
 * public landing page. A real decision (success response from the backend,
 * either allowed or blocked) is cached in sessionStorage for 30 minutes so
 * repeat navigations/refreshes within a tab don't re-hit the check API each
 * time — bounded staleness (an admin flipping settings takes up to 30 min to
 * apply to an already-cached tab) traded for materially lower request volume.
 * Only a *successful* decision is ever cached — a failed check (network
 * error, rate limit, backend outage) is NOT cached, since caching a
 * fail-closed fallback would trap someone in a false block for 30 minutes
 * over what might be a one-off blip.
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

  // shouldCache is true only for a genuine backend decision — never for the
  // fail-closed fallback used when the check call itself errors out, so a
  // transient failure can't get frozen in place for 30 minutes.
  const finish = (allowed: boolean, shouldCache = false) => {
    if (shouldCache) writeCache(allowed);
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
      .then((res) => finish(res.allowed, true))
      .catch(() => finish(false)); // can't get a decision → fail closed, not open (explicit requirement: never let a check failure become an access grant)
  };

  const runGpsCheck = (lat: number, lon: number) => {
    geoClient
      .check({ lat, lon })
      .then((res) => finish(res.allowed, true))
      .catch(() => finish(false));
  };

  // fallbackToIp/strictMode from the last status fetch — read in
  // handleGpsDenied, stashed here since the geolocation callback fires
  // asynchronously well after the initial status check.
  const [gpsFallback, setGpsFallback] = useState({ fallbackToIp: true, strictMode: false });

  const handleGpsDenied = () => {
    if (gpsFallback.strictMode) {
      finish(false, true); // strict-mode denial is a real policy decision, not a failure — safe to cache
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

    // A cached decision skips both the settings read and the check call
    // entirely — this is what keeps repeat navigations/refreshes within the
    // 30-minute window from hitting the API at all.
    const cached = readCache();
    if (cached) {
      if (cached.allowed) {
        setPhase('allowed');
      } else {
        setPhase('blocked');
        router.replace('/service-unavailable');
      }
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
        // Can't even read settings — fail closed rather than assume geo is
        // off. A real outage this deep already breaks the rest of the app
        // too; this just keeps that failure mode consistent instead of
        // quietly granting access as a side effect of it. Not cached — see
        // the fail-closed note on runIpCheck/runGpsCheck.
        if (!cancelled) finish(false);
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
