import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { RefreshTokenService } from './refresh-token.service';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly

/**
 * RefreshTokenService.purgeExpired() previously had no scheduler wired up —
 * expired and rotated-out rows accumulated forever. This just runs it
 * periodically in-process; no new dependency (e.g. @nestjs/schedule) needed
 * for a single hourly interval.
 */
@Injectable()
export class RefreshTokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly refreshTokenService: RefreshTokenService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.refreshTokenService.purgeExpired().catch((err) => {
        this.logger.error(`Refresh token cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
