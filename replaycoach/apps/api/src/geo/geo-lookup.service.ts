import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { GeoLookupResult, IpGeoProvider } from './providers/geo-provider.interface';
import { IpApiProvider } from './providers/ip-api.provider';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — keeps repeat visitors within ip-api.com's free-tier 45 req/min budget

interface CacheEntry {
  result: GeoLookupResult | null;
  expiresAt: number;
}

/**
 * Resolves the configured provider (GEO_PROVIDER env var — see
 * configuration.ts) and wraps it with an in-memory TTL cache. Adding a new
 * provider is: implement IpGeoProvider (see providers/ip-api.provider.ts),
 * add one entry to the registry below — no other code changes, business
 * logic (geo-access.service.ts) only ever depends on this class.
 */
@Injectable()
export class GeoLookupService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly provider: IpGeoProvider;

  constructor(
    private readonly configService: ConfigService,
    private readonly ipApiProvider: IpApiProvider,
  ) {
    const registry: Record<string, IpGeoProvider> = {
      'ip-api': this.ipApiProvider,
    };
    const configured = this.configService.get<string>('geo.provider', 'ip-api');
    this.provider = registry[configured] ?? this.ipApiProvider;
  }

  async lookup(ip: string): Promise<GeoLookupResult | null> {
    const cached = this.cache.get(ip);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    const result = await this.provider.lookup(ip);
    this.cache.set(ip, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }
}
