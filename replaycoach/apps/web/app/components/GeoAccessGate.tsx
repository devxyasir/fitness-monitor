'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { geoClient } from '../../lib/geo-client';
import { systemSettingsClient } from '../../lib/system-settings-client';
import { useAuthStore } from '../../stores/auth-store';
import { PageLoader } from './ui/PageLoader';
import { GeoPermissionExplainer, GeoPermissionDeniedModal } from './GeoPermissionModal';

const CACHE_KEY = 'geo_access_status';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

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

type Phase = 'checking' | 'allowed' | 'blocked' | 'gps-explain' | 'gps-denied';

/**
 * Client-side geo gate, checked once per session (sessionStorage-cached) on
 * every route except the public landing page — confirmed gate scope: app
 * usage (login, register, dashboard, all role sections) is gated, `/`
 * stays open for SEO/marketing regardless of location.
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
 */
export function GeoAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();
  const [phase, setPhase] = useState<Phase>('checking');

  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const isExempt =
    pathname === '/' ||
    pathname === '/service-unavailable' ||
    isAdminRoute ||
    user?.role === 'platform_admin';

  const finish = (allowed: boolean) => {
    writeCache(allowed);
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

    const cached = readCache();
    if (cached) {
      if (cached.allowed) setPhase('allowed');
      else {
        setPhase('blocked');
        router.replace('/service-unavailable');
      }
      return;
    }

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
