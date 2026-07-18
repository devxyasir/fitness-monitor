export interface GeoLookupResult {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
}

/**
 * A pluggable IP geolocation backend. Implementations must never throw —
 * a provider outage or rate-limit hit should degrade to `null` (an unknown
 * location, handled by the decision engine's `blockUnknownLocations`
 * setting), not crash the request the check is running inside of.
 */
export interface IpGeoProvider {
  lookup(ip: string): Promise<GeoLookupResult | null>;
}
