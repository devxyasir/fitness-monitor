import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { GeoCheckResponse, GeoDetectionMethod } from '@replaycoach/types';

import { SystemSettingsService } from '../system-settings/system-settings.service';
import { GeoLookupService } from './geo-lookup.service';
import { GeoAccessService } from './geo-access.service';
import { GeoAccessLog } from './geo-access-log.entity';
import type { GeoLookupResult } from './providers/geo-provider.interface';

const REVERSE_GEOCODE_TIMEOUT_MS = 3000;

/**
 * Orchestrates a single geo check: resolve location (IP or GPS reverse
 * geocode) → run the decision engine → log the outcome → respond. The one
 * place both GeoController's POST /geo/check and GeoAccessGuard call, so
 * the actual allow/block flow is never duplicated.
 */
@Injectable()
export class GeoCheckService {
  private readonly logger = new Logger(GeoCheckService.name);

  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly lookupService: GeoLookupService,
    private readonly accessService: GeoAccessService,
    @InjectRepository(GeoAccessLog)
    private readonly logRepo: Repository<GeoAccessLog>,
  ) {}

  async check(ip: string, userId: string | null, gps?: { lat: number; lon: number }): Promise<GeoCheckResponse> {
    const settings = await this.systemSettingsService.getGeoAccess();

    if (!settings.enabled) {
      return { allowed: true, location: null };
    }

    let location: GeoLookupResult | null = null;
    let detectionMethod: GeoDetectionMethod = 'ip';

    if (settings.detectionMethod === 'gps' && gps) {
      detectionMethod = 'gps';
      location = await this.reverseGeocode(gps.lat, gps.lon);
      // A reverse-geocode infra hiccup (not a user permission denial —
      // that's a frontend-only concern, the browser never hands us
      // coordinates in that case) always falls back to IP rather than
      // blocking on a transient third-party outage.
      if (!location) {
        detectionMethod = 'ip';
        location = await this.lookupService.lookup(ip);
      }
    } else {
      location = await this.lookupService.lookup(ip);
    }

    const decision = this.accessService.decide(settings, location);

    await this.logRepo.save(
      this.logRepo.create({
        userId,
        ip,
        country: location?.country ?? null,
        countryCode: location?.countryCode ?? null,
        region: location?.region ?? null,
        city: location?.city ?? null,
        detectionMethod,
        allowed: decision.allowed,
        reason: decision.reason ?? null,
      }),
    );

    return {
      allowed: decision.allowed,
      location: location
        ? {
            country: location.country,
            countryCode: location.countryCode,
            region: location.region,
            city: location.city,
            lat: location.lat,
            lon: location.lon,
          }
        : null,
      ...(decision.reason ? { reason: decision.reason } : {}),
    };
  }

  /** OpenStreetMap Nominatim — free, keyless, matches the "free tier to
   * start" approach already used for IP lookup. Usage policy requires a
   * descriptive User-Agent, not a key. */
  private async reverseGeocode(lat: number, lon: number): Promise<GeoLookupResult | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REVERSE_GEOCODE_TIMEOUT_MS);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
        { signal: controller.signal, headers: { 'User-Agent': 'LetsMove-GeoAccessControl/1.0' } },
      );
      clearTimeout(timeout);
      if (!res.ok) return null;

      const body = (await res.json()) as { address?: Record<string, string> };
      const addr = body.address ?? {};
      const countryCode = addr['country_code'] ? addr['country_code'].toUpperCase() : null;

      return {
        country: addr['country'] ?? null,
        countryCode,
        region: addr['state'] ?? addr['region'] ?? null,
        city: addr['city'] ?? addr['town'] ?? addr['village'] ?? null,
        lat,
        lon,
      };
    } catch (err) {
      this.logger.warn(`Reverse geocode failed for ${lat},${lon}: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}
