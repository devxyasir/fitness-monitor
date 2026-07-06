import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Express's default JSON body limit (~100kb) is fine for normal API calls,
  // but the pose-service's reference-video completion callback posts the
  // full per-frame keypoints array — multiple MB for longer videos — and was
  // silently getting 413'd, leaving the video stuck on 'processing' forever
  // (the pose-service callback doesn't check the response status). Raise it
  // app-wide since it's simplest and this endpoint isn't user-facing anyway.
  app.useBodyParser('json', { limit: '20mb' });

  // ── Redis WebSocket adapter horizontal scaling ─────────────────────────────
  const configService = app.get(ConfigService);
  const redisIoAdapter = new RedisIoAdapter(app, configService);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // ── Security headers (16_Security_Guidelines.md §3) ──────────────────────
  app.use(helmet());

  // ── Cookie parser for httpOnly refresh token cookie ───────────────────────
  app.use(cookieParser());

  // ── CORS ──────────────────────────────────────────────────────────────────
  const corsOrigin = process.env['CORS_ORIGIN']
    ? process.env['CORS_ORIGIN'].split(',')
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];
  app.enableCors({
    origin: corsOrigin,
    credentials: true,          // required for cookies
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  // ── Global prefix ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── DTO validation (12_Backend_API_Design.md §6) ─────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // strip unknown fields
      forbidNonWhitelisted: true, // reject requests with unknown fields
      transform: true,
    }),
  );

  // ── Global exception filter and request-id interceptor ───────────────────
  const reflector = app.get(Reflector);
  void reflector; // used implicitly by NestJS
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());

  const port = process.env['PORT'] ?? '3001';
  await app.listen(parseInt(port, 10));
}

bootstrap().catch(console.error);
