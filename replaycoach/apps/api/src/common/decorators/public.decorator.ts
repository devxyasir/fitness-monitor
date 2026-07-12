import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a valid access token. JwtAuthGuard is
 * registered globally (see app.module.ts) so every route requires auth by
 * default — this is the explicit opt-out for the handful that must stay
 * open (health check, register/login/refresh, webhooks that self-verify via
 * HMAC, signed-URL media streaming, invite previews, etc.).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
