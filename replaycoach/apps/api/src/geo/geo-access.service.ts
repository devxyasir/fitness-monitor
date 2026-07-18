import { Injectable } from '@nestjs/common';
import type { GeoAccessSettings } from '@replaycoach/types';
import type { GeoLookupResult } from './providers/geo-provider.interface';

export interface GeoDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Pure decision engine — no I/O, easy to reason about and test in
 * isolation. The single source of truth both GeoController's POST
 * /geo/check and GeoAccessGuard defer to, so the actual allow/block rule is
 * never implemented twice.
 */
@Injectable()
export class GeoAccessService {
  decide(settings: GeoAccessSettings, location: GeoLookupResult | null): GeoDecision {
    if (!settings.enabled || settings.mode === 'global') {
      return { allowed: true };
    }

    if (!location || !location.countryCode) {
      return settings.blockUnknownLocations
        ? { allowed: false, reason: 'unknown_location' }
        : { allowed: true };
    }

    const countryAllowed = settings.allowedCountries.includes(location.countryCode);
    if (!countryAllowed) {
      return { allowed: false, reason: 'country_not_allowed' };
    }

    // Country is allowed. If this country has region-level restrictions
    // configured, the visitor's detected region must match one of them —
    // no entry means "the whole country is allowed," matching
    // GeoAllowedRegion's documented contract in @replaycoach/types.
    const regionRule = settings.allowedRegions.find((r) => r.countryCode === location.countryCode);
    if (!regionRule || regionRule.regionNames.length === 0) {
      return { allowed: true };
    }

    const detectedRegion = (location.region ?? '').trim().toLowerCase();
    const regionAllowed = regionRule.regionNames.some((name) => name.trim().toLowerCase() === detectedRegion);
    return regionAllowed ? { allowed: true } : { allowed: false, reason: 'region_not_allowed' };
  }
}
