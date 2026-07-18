import { Injectable, Logger } from '@nestjs/common';
import type { GeoLookupResult, IpGeoProvider } from './geo-provider.interface';

interface IpApiResponse {
  status: 'success' | 'fail';
  message?: string;
  country?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  lat?: number;
  lon?: number;
}

const LOOKUP_TIMEOUT_MS = 3000;

/**
 * ip-api.com's free, keyless JSON endpoint — no account needed to ship this
 * feature. Free tier is HTTP-only (not HTTPS) and rate-limited to 45
 * req/min; geo-lookup.service.ts's cache is what keeps this within that
 * budget under real traffic, not this class. Swapping to a paid/HTTPS
 * provider later is a new class + one line in the provider registry, not a
 * rewrite — see geo-lookup.service.ts.
 */
@Injectable()
export class IpApiProvider implements IpGeoProvider {
  private readonly logger = new Logger(IpApiProvider.name);

  async lookup(ip: string): Promise<GeoLookupResult | null> {
    // Private/loopback ranges never resolve to a real location — common in
    // local dev and worth failing fast on rather than sending to the
    // provider (which would just reject it anyway).
    if (this.isPrivateOrLoopback(ip)) return null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
      const res = await fetch(
        `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,regionName,city,lat,lon`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);

      if (!res.ok) return null;
      const body = (await res.json()) as IpApiResponse;
      if (body.status !== 'success') return null;

      return {
        country: body.country ?? null,
        countryCode: body.countryCode ?? null,
        region: body.regionName ?? null,
        city: body.city ?? null,
        lat: body.lat ?? null,
        lon: body.lon ?? null,
      };
    } catch (err) {
      // Provider outage/timeout/rate-limit — degrade to "unknown", never
      // throw. The decision engine's blockUnknownLocations setting decides
      // what happens next, not this class.
      this.logger.warn(`ip-api lookup failed for ${ip}: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  private isPrivateOrLoopback(ip: string): boolean {
    if (ip === '::1' || ip === '127.0.0.1') return true;
    return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  }
}
