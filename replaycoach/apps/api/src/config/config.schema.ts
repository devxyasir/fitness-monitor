import * as Joi from 'joi';

export const configSchema = Joi.object({
  PORT: Joi.number().default(3001),
  NODE_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

  // Database — required
  DATABASE_URL: Joi.string().uri().required(),

  // JWT — required
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
  JWT_SESSION_EXPIRY: Joi.string().default('1d'),

  // Refresh-cookie strategy — only relevant when web + API are on different domains
  AUTH_COOKIE_SAMESITE: Joi.string().valid('strict', 'lax', 'none').default('strict'),
  AUTH_COOKIE_DOMAIN: Joi.string().allow('').optional(),

  // Redis — required
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

  // LiveKit
  LIVEKIT_API_KEY: Joi.string().when('NODE_ENV', {
    is: Joi.string().valid('production', 'staging'),
    then: Joi.string().required(),
    otherwise: Joi.string().optional(),
  }),
  LIVEKIT_API_SECRET: Joi.string().when('NODE_ENV', {
    is: Joi.string().valid('production', 'staging'),
    then: Joi.string().required(),
    otherwise: Joi.string().optional(),
  }),
  LIVEKIT_URL: Joi.string().default('ws://localhost:7880'),

  // CloudFront
  CLOUDFRONT_DOMAIN: Joi.string().optional(),
  CLOUDFRONT_KEY_PAIR_ID: Joi.string().optional(),
  CLOUDFRONT_PRIVATE_KEY: Joi.string().optional(),

  // Pose service
  POSE_SERVICE_URL: Joi.string().default('http://localhost:8100'),
});
