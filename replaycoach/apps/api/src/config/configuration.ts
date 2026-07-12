export default () => ({
  app: {
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    env: process.env['NODE_ENV'] ?? 'development',
    corsOrigin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3000',
  },
  database: {
    url: process.env['DATABASE_URL'],
    synchronize: false, // always use migrations — never true in production
    logging: process.env['NODE_ENV'] === 'development',
  },
  jwt: {
    secret: process.env['JWT_SECRET'],
    expiry: process.env['JWT_EXPIRY'] ?? '15m',
    refreshSecret: process.env['JWT_REFRESH_SECRET'],
    // "Remember me" TTL — long-lived, persistent refresh cookie.
    refreshExpiry: process.env['JWT_REFRESH_EXPIRY'] ?? '7d',
    // Default (non-"remember me") TTL — short-lived session cookie, cleared
    // on browser close.
    sessionExpiry: process.env['JWT_SESSION_EXPIRY'] ?? '1d',
  },
  auth: {
    cookieSameSite: process.env['AUTH_COOKIE_SAMESITE'] ?? 'strict',
    cookieDomain: process.env['AUTH_COOKIE_DOMAIN'] ?? '',
  },
  redis: {
    url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
  },
  livekit: {
    apiKey: process.env['LIVEKIT_API_KEY'],
    apiSecret: process.env['LIVEKIT_API_SECRET'],
    url: process.env['LIVEKIT_URL'] ?? 'ws://localhost:7880',
  },
  cloudfront: {
    domain: process.env['CLOUDFRONT_DOMAIN'],
    keyPairId: process.env['CLOUDFRONT_KEY_PAIR_ID'],
    privateKey: process.env['CLOUDFRONT_PRIVATE_KEY'],
  },
});
