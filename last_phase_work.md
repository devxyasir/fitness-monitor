ReplayCoach API — Phase 5 Backend Platform Hardening: Ground-Truth State Report
Root: c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src

1. Module / Service / Repository Architecture
Every NestJS module under src/ (from app.module.ts:94-107 imports plus each module file):

Module	File	Owns
AuthModule	auth/auth.module.ts	register/login/refresh/logout, password reset stub, JWT strategy, refresh-token rotation + hourly cleanup, ThrottlerModule.forRoot registration
UserModule	users/user.module.ts	User entity CRUD, status changes
OrganizationModule	organizations/organization.module.ts	Orgs, org invites, OrganizationGuard
TeamsModule	teams/teams.module.ts	Teams + team members under an org
HealthModule	health/health.module.ts	/health endpoint only
SessionsModule	sessions/sessions.module.ts	Coaching session lifecycle, SessionsGuard
MediaModule	media/media.module.ts	LiveKit service, LiveKit egress start/stop, LiveKit webhook receiver, CloudFront URL signer
ReplayModule	replay/replay.module.ts	Buffer-replay / targeted-replay trigger endpoints
RealtimeModule	realtime/realtime.module.ts	The Socket.IO gateway (annotations, replay, lobby, reference video sync)
AnnotationsModule	annotations/annotations.module.ts	Read endpoints for session/clip annotations (writes happen via the gateway)
PoseModule	pose/pose.module.ts	Pose keypoint storage/retrieval, Redis-stream relay from pose-service, Redis-stream command publisher to pose-service
ClipsModule	clips/clips.module.ts	Clip creation, sharing, CloudFront-signed playback URLs
RecordingsModule	recordings/recordings.module.ts	Recording entity persistence (no controller — service-only, consumed by MediaModule/PoseModule)
ReferenceModule	reference/reference.module.ts	Reference-video upload/analysis pipeline, tracked annotations, pose-service callback endpoints, signed media streaming
Layering — controller → service → repository? No dedicated repository layer exists anywhere; TypeORM Repository<Entity> (via @InjectRepository) is the repository layer, injected straight into services. Confirmed no custom repository abstraction: a grep for extends Repository / class \w+Repository across src/ returns zero matches.

Controllers that bypass services and call TypeORM repositories directly (breaks the controller→service→repo layering):

pose/pose.controller.ts:11,25-28 — PoseController directly injects @InjectRepository(Session) and @InjectRepository(SessionParticipant) and calls .findOne() on them at pose/pose.controller.ts:48-50,61-63 for its own authorization check, instead of delegating to SessionsService/PoseService.
realtime/realtime.gateway.ts:11,47-50 — RealtimeGateway (a WS "controller" equivalent) directly injects @InjectRepository(Session) and @InjectRepository(SessionParticipant) and does raw .findOne() lookups at e.g. realtime.gateway.ts:91-101,146,408,504, rather than going through SessionsService.
Every other controller (auth, users, organizations, teams, sessions, clips, replay, annotations, reference) only calls its own *Service — confirmed via grep "@InjectRepository|extends Repository" --glob *.controller.ts returning only pose.controller.ts.

2. DTOs and Validation
Global ValidationPipe is confirmed in main.ts:51-57:


new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
Consistent DTO usage — every write endpoint across auth, users, organizations, teams, sessions, clips, replay, reference (the JWT-protected controller) uses a class-validator-decorated class for @Body() (verified: sessions/session.dto.ts:1-37, reference/reference.dto.ts:1-105, replay/replay.controller.ts:20-44 inline classes, organizations/organization.dto.ts, clips/clips.dto.ts).

Endpoints that accept raw/untyped bodies, NOT class-validator DTOs (found by grepping @Body() across all *.controller.ts and checking each type):

media/egress-webhook.controller.ts:83 — @Body() body: LiveKitWebhookEvent where LiveKitWebhookEvent is a plain TS interface (media/egress-webhook.controller.ts:33-39), not a class — TypeScript interfaces are erased at runtime, so ValidationPipe has no metatype to validate against; this body passes through unvalidated. (Mitigated in practice: the real value is overwritten by webhookReceiver.receive() at media/egress-webhook.controller.ts:95 once the LiveKit HMAC signature is verified — the raw body param is only used as a JSON.stringify fallback and in mock mode.)
reference/reference.controller.ts:193-204 — ReferenceMediaController.complete(): @Body() body: { status: 'ready'|'failed'; reason?; keypoints?: unknown; fps?; frameCount?; width?; height?; durationMs?; keypointFormat? } — an inline object-literal type, not a DTO class. No field-level validation (e.g. keypoints is unknown, no bounds/shape checks).
reference/reference.controller.ts:280 — ReferenceMediaController.exportFailed(): @Body() body: { reason?: string } — inline type, unvalidated.
Both #2 and #3 are on ReferenceMediaController, which is @Public() (reference/reference.controller.ts:180) and instead relies on an HMAC x-callback-token header check (reference.controller.ts:206-207,241-243,282-283) rather than JWT — so the missing DTO validation is the only input-shape guard on these three routes.

reference/reference.dto.ts:101-104 — SyncReferenceAnnotationsDto.strokesByFrame is only @IsObject(); the nested ReferenceStroke[] values (reference.dto.ts:85-93) are a plain TS interface with no class-validator decorators, so nested shape isn't validated field-by-field (whitelist stripping also won't reach inside it).

3. Error Handling & Exception Filters
common/filters/http-exception.filter.ts (global, registered main.ts:62) — full behavior, read line by line:

@Catch() (catches everything) http-exception.filter.ts:16-17.
Extracts requestId from request.headers['x-request-id'] (:24) — this is the same header RequestIdInterceptor writes onto the request object before the handler runs (see §4), so it's populated for every request, not just ones where the client sent it.
If exception instanceof HttpException (:30-41): copies statusCode via .getStatus(), and unpacks .getResponse() — if it's a validation-pipe-style object with message: string[], joins them with , (:37-39); otherwise uses .message. Copies error from the response body if present.
If not an HttpException** (unknown/raw Error, DB error, etc.) (:42-48): status stays 500, message stays the generic 'Internal server error', errorstays'Internal Server Error' — the actual exception message/stack is **only** written to the server log (this.logger.error(...)at:44-47), never returned to the client. This is the stack-trace-hiding behavior — it is unconditional (not NODE_ENV`-gated); in other words dev and prod get the same generic body for unknown errors.
Handles the case where the response already started streaming (response.headersSent, :57-61) — logs a warning and calls response.destroy() instead of trying to call .json() (which would throw ERR_HTTP_HEADERS_SENT and crash the process). This exists specifically for reference-video/clip streaming routes.
Final response shape (:63): { statusCode, error, message, requestId } — always this exact shape for every error, across the whole API.
Raw Error thrown instead of an HttpException: realtime/realtime.gateway.ts:505,507 — assertCoach() throws plain new Error('Session not found') / new Error('Forbidden'). This is inside a WebSocket gateway, not an HTTP controller, so HttpExceptionFilter never sees it (gateways aren't HTTP request/response); the caller (handleReferenceState etc., e.g. :524-529) wraps it in a try/catch and manually returns { status: 'error', message: 'Forbidden' } over the socket ack — so the raw-Error pattern here doesn't actually leak anywhere, it's just structurally different from the HTTP error path (WS acks use {status, message}, HTTP uses {statusCode, error, message, requestId} — two different, uncoordinated error shapes for HTTP vs WS).

Response-shape consistency spot-check across 6 controllers — all HTTP paths ultimately funnel through HttpExceptionFilter, and every controller throws Nest HttpException subclasses (NotFoundException, ForbiddenException, BadRequestException, UnauthorizedException, UnprocessableEntityException) rather than raw errors:

pose/pose.controller.ts:53,66 — NotFoundException, ForbiddenException.
clips/clips.service.ts:56,60,64 — NotFoundException, ForbiddenException, UnprocessableEntityException.
reference/reference.controller.ts:207,245,264,283 / reference.service.ts:97-99,114,117,130,136,142 — UnauthorizedException, BadRequestException, NotFoundException, ForbiddenException.
media/egress-webhook.controller.ts:90,99 — UnauthorizedException.
auth/refresh-token.service.ts:167 — UnauthorizedException.
common/guards/roles.guard.ts:31 — ForbiddenException.
So yes — response shape is consistent for HTTP; the one inconsistency is HTTP vs. WebSocket error shapes being different (expected, since WS doesn't go through the HTTP filter), and the two raw-Error throws in the gateway (realtime.gateway.ts:505,507) are the only non-HttpException throws found anywhere in src/.

4. Logging
Not uniformly applied. grep "new Logger(" across src/ (excluding specs) → 18 files have a Logger instance; the following service/controller/gateway files have no Logger at all (no new Logger(...), confirmed no console.* either):

auth/auth.service.ts — zero logging of any kind (no login/register/logout audit trail, no failure logging).
annotations/annotations.controller.ts, auth/auth.controller.ts, clips/clips.controller.ts, health/health.controller.ts, organizations/invites.controller.ts, organizations/organization.controller.ts, organizations/organization.service.ts, pose/pose.controller.ts, recordings/recordings.service.ts, reference/reference.controller.ts, replay/replay.controller.ts, sessions/sessions.controller.ts, teams/teams.controller.ts, teams/teams.service.ts, users/user.controller.ts, users/user.service.ts.
Where Logger is used, the pattern is consistent: private readonly logger = new Logger(ClassName.name), e.g. common/filters/http-exception.filter.ts:18, media/egress.service.ts:17, reference/reference-storage.service.ts:29, auth/refresh-token-cleanup.service.ts:15.

console.* usage: only main.ts:69 (bootstrap().catch(console.error) — top-level bootstrap failure, reasonable) and a stray debug file src/tmp_redis_test.js:5,10,14 (a leftover ad hoc script sitting directly in src/, not part of any module, using console.log/console.error). Also stray untracked scripts at the apps/api root: test_db.js, test_endpoints.js, test_pg.js (outside src/, not part of the Nest app).

RequestIdInterceptor (common/interceptors/request-id.interceptor.ts), global (main.ts:63) — exact behavior:

Reads x-request-id from the incoming request header, or generates a uuidv4() if absent (:17).
Writes it back onto req.headers['x-request-id'] (:19) — this is what makes it available to HttpExceptionFilter later in the pipeline.
On response, sets X-Request-Id response header via res.setHeader(...) (:27), skipping it if headers were already sent (streaming responses, :26).
Does the request id appear in log lines, or just as a response header? It appears in both, but only inside HttpExceptionFilter's own log line (http-exception.filter.ts:45, :58) — i.e. only on the error path. On the success path, no interceptor/middleware logs requestId alongside application log lines; every other service's this.logger.log(...) calls (e.g. media/egress.service.ts:48,76, pose/pose-relay.service.ts:50) log plain messages with no request-id correlation — so multi-line request tracing across services is not possible from logs alone outside of error paths.
Sensitive-data redaction in logs (auth-specific check):

auth/auth.service.ts has no logging at all (see above) — so no risk there by omission, but also no login/logout audit trail.
auth/refresh-token.service.ts:152-153,184 — logs only familyId (a UUID) and event descriptions ("grace-window hit", "revoked (reuse detected)"); never logs the raw token value itself. Good practice, confirmed by reading the whole rotate/revoke flow (refresh-token.service.ts:135-199).
No file anywhere logs password, dto.password, JWT secrets, or raw refresh/access tokens — confirmed via targeted read of auth/auth.service.ts, auth/refresh-token.service.ts, auth/jwt.strategy.ts.
5. Configuration & Environment Variables
config/configuration.ts (full file, 39 lines) — nested config object grouped as:

app: port (PORT, default 3001), env (NODE_ENV), corsOrigin (CORS_ORIGIN) — configuration.ts:2-6.
database: url (DATABASE_URL), synchronize (hardcoded false), logging (NODE_ENV==='development') — :7-11.
jwt: secret, expiry (default 15m), refreshSecret, refreshExpiry (default 7d), sessionExpiry (default 1d) — :12-21.
auth: cookieSameSite (default strict), cookieDomain (default '') — :22-25.
redis: url (default redis://localhost:6379) — :26-28.
livekit: apiKey, apiSecret, url (default ws://localhost:7880) — :29-33.
cloudfront: domain, keyPairId, privateKey — :34-38.
config/config.schema.ts (Joi, full file, 46 lines) validates: PORT, NODE_ENV (enum incl. staging), CORS_ORIGIN, DATABASE_URL (required, URI), JWT_SECRET/JWT_REFRESH_SECRET (required, min 32 chars), JWT_EXPIRY/JWT_REFRESH_EXPIRY/JWT_SESSION_EXPIRY, AUTH_COOKIE_SAMESITE/AUTH_COOKIE_DOMAIN, REDIS_URL, LIVEKIT_API_KEY/LIVEKIT_API_SECRET (conditionally required only when NODE_ENV is production/staging, :26-35), LIVEKIT_URL, CLOUDFRONT_DOMAIN/CLOUDFRONT_KEY_PAIR_ID/CLOUDFRONT_PRIVATE_KEY (all optional), POSE_SERVICE_URL (default http://localhost:8100).

Config keys used in code but present in NEITHER configuration.ts NOR config.schema.ts (read via ConfigService.get('RAW_ENV_NAME'), which works only because Nest's ConfigService falls through to process.env for unknown keys, and Joi's default validationOptions allows unknown env vars):

S3_REFERENCE_VIDEOS_BUCKET — reference/reference-storage.service.ts:46.
AWS_REGION — reference/reference-storage.service.ts:47, media/egress.service.ts:33.
API_PUBLIC_URL — reference/reference-storage.service.ts:43.
S3_RAW_RECORDINGS_BUCKET — media/egress.service.ts:32.
nodeEnv (note: not app.env / NODE_ENV, a different/wrong key name) — media/egress.service.ts:30. Since configuration.ts never registers a top-level nodeEnv key (it registers app.env), configService.get<string>('nodeEnv') always returns undefined here and falls back to the hardcoded default 'dev' (:30) — i.e. this line can never actually pick up NODE_ENV, it always uses the literal string 'dev' in the bucket-name fallback (replaycoach-${environment}-recordings-raw, :32).
Hardcoded values found in a spot check of services (candidates for env-configuration):

pose/pose.service.ts:16-17,22-23 — FLUSH_BATCH_SIZE = 50, FLUSH_INTERVAL_MS = 1000 (pose keypoint buffer flush tuning), RECORDING_CACHE_HIT_TTL_SEC = 3600, RECORDING_CACHE_MISS_TTL_SEC = 15 — all hardcoded module-level constants, not env-driven.
pose/pose-relay.service.ts:28 — MAX_FAILURES = 5 (circuit breaker threshold), hardcoded.
auth/refresh-token-cleanup.service.ts:5 — CLEANUP_INTERVAL_MS = 60 * 60 * 1000 (hourly), hardcoded.
reference/reference.controller.ts:41 / reference.service.ts:18 — MAX_UPLOAD_BYTES = 500 * 1024 * 1024 duplicated as a literal in two files, not env-driven.
reference/reference-storage.service.ts:134 — default ttlSeconds = 6 * 60 * 60 for signed media URLs, hardcoded default parameter.
media/cloudfront-signer.ts:30 — default ttlSeconds: number = 900, hardcoded.
main.ts:22 — JSON body limit '20mb', hardcoded literal in main.ts, not env-configurable (comment at :16-21 explains why).
realtime/realtime.gateway.ts:22-27 — the WS gateway re-reads process.env['CORS_ORIGIN'] directly (raw process.env, not via ConfigService) with its own hardcoded fallback list, duplicating (and structurally diverging from — see §13) the same logic already in main.ts:37-39.
.env.example vs. config.schema.ts — drifted, not in sync. .env.example (full contents read):

Marks DATABASE_URL, REDIS_URL, JWT_SECRET/JWT_EXPIRY/JWT_REFRESH_EXPIRY as commented-out "(not used yet, placeholder for Phase 1)" even though config.schema.ts marks DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET as required — the app will not boot without them, contradicting the "not used yet" comment.
Missing entirely from .env.example: JWT_REFRESH_SECRET (required!), JWT_SESSION_EXPIRY, CLOUDFRONT_DOMAIN/CLOUDFRONT_KEY_PAIR_ID/CLOUDFRONT_PRIVATE_KEY, POSE_SERVICE_URL, S3_RAW_RECORDINGS_BUCKET, NODE_ENV.
Mentions AWS_REGION, AWS_S3_BUCKET_RECORDINGS, AWS_S3_BUCKET_CLIPS (labeled "not used yet, placeholder for Phase 2") — but the actual code never reads AWS_S3_BUCKET_RECORDINGS or AWS_S3_BUCKET_CLIPS (those exact names don't appear anywhere in src/); the real variable is S3_RAW_RECORDINGS_BUCKET (egress.service.ts:32), a different name never mentioned in .env.example.
Does mention S3_REFERENCE_VIDEOS_BUCKET and API_PUBLIC_URL correctly and with accurate explanatory comments (.env.example reference-video block) — these two are documented in .env.example but still absent from config.schema.ts.
6. API Versioning
main.ts:48 — app.setGlobalPrefix('api/v1'). That is the entire versioning implementation. No NestJS VersioningType (URI/header/media-type) is configured anywhere — confirmed no enableVersioning( call anywhere in src/. v1 is a hardcoded string baked into the prefix and also hardcoded again in several places that build absolute URLs pointing back at the API itself: reference/reference.service.ts:170-171 (/api/v1/reference/${video.id}/complete, /overlay), reference/reference-storage.service.ts:144 (/api/v1/reference/media/${key}). There is no versioning strategy beyond this single hardcoded prefix — no v2 scaffolding, no per-route @Version() decorators anywhere.

7. Health Endpoints
Exactly one health endpoint in apps/api: health/health.controller.ts:7-17.


@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): HealthResponse {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
It performs no checks at all — returns {status:'ok', timestamp} unconditionally, regardless of DB, Redis, LiveKit, or pose-service reachability. health/health.module.ts registers only this controller, no providers. No @nestjs/terminus dependency exists in package.json (confirmed via dependency listing — absent). No DB-connectivity or Redis-connectivity check exists anywhere in apps/api. No readiness/liveness distinction (/healthz, /readyz, etc.) exists.

8. Rate Limiting
ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]) is registered only inside AuthModule (auth/auth.module.ts:6,31) — not in AppModule. AppModule's APP_GUARD providers are only JwtAuthGuard and RolesGuard (app.module.ts:115-116) — ThrottlerGuard is never registered as an APP_GUARD, and it is never applied via @UseGuards(ThrottlerGuard) on any controller or route anywhere in src/.

Grep for ThrottlerGuard across all of src/ returns matches only in auth/auth.controller.spec.ts:4,31,46-47 (a test mock/override). There is no production code path that ever instantiates or activates ThrottlerGuard.

Practical consequence: @Throttle() decorators are inert (a no-op) without ThrottlerGuard actually guarding the route — Nest's throttler only enforces limits when its guard runs. The two decorated endpoints are:

auth/auth.controller.ts:60 — @Throttle({ default: { limit: 5, ttl: 60000 } }) on POST /auth/login.
auth/auth.controller.ts:106 — @Throttle({ default: { limit: 3, ttl: 3600000 } }) on POST /auth/password/forgot.
Neither is currently enforced at runtime given the missing guard registration.

Abusable endpoints with no rate limiting at all (no @Throttle, and even if there were, no guard to enforce it):

reference/reference.controller.ts:52-53 — POST /sessions/:id/reference/upload — up to 500MB file upload, triggers a downstream pose-service analysis job (reference.service.ts:167-195). JWT-gated but otherwise unlimited call frequency.
reference/reference.controller.ts:161-168 — POST /sessions/:id/reference/:refId/export — triggers pose-service export rendering work, no throttle.
auth/auth.controller.ts:44-51 — POST /auth/register — @Public(), unauthenticated, no @Throttle() at all (unlike login/forgot-password).
auth/auth.controller.ts:114-121 — POST /auth/password/reset — @Public(), unauthenticated, no @Throttle().
media/egress-webhook.controller.ts:79-80 and reference/reference.controller.ts:189,234,253,276 — all @Public() webhook/callback endpoints have no rate limiting (they rely solely on signature/HMAC-token verification for protection, not rate limits).
9. File Uploads
Every FileInterceptor/UploadedFile usage (grep across src/):

Location	Limit	Mime validation	Storage
reference/reference.controller.ts:53 — POST .../reference/upload	MAX_UPLOAD_BYTES = 500MB (reference.controller.ts:41) passed to FileInterceptor('file', { limits: { fileSize } })	Application-level, not multer fileFilter: reference.service.ts:19,138-143 — ALLOWED_MIME_TYPES = Set(['video/mp4','video/quicktime','video/webm','video/x-matroska']), base mimetype (stripped of codec suffix) checked, throws BadRequestException if not allowed	In-memory Buffer (default multer memory storage — no MulterModule config anywhere means default in-memory), then ReferenceStorageService.saveBuffer() (reference-storage.service.ts:85-95) writes to either S3 (PutObjectCommand) or local disk under apps/api/uploads/reference-videos/
reference/reference.controller.ts:235 — POST .../reference/:refId/overlay (pose-service callback)	Same MAX_UPLOAD_BYTES	None — no mimetype check on this endpoint (reference.controller.ts:236-249, only a !file check)	Buffer → referenceService.saveOverlayVideo(refId, file.buffer)
reference/reference.controller.ts:254 — POST .../reference/:refId/export-upload (pose-service callback)	Same MAX_UPLOAD_BYTES	None	Buffer → referenceService.saveExportVideo(refId, file.buffer)
No multer fileFilter option is used anywhere (limits: { fileSize } only) — mimetype checking that exists is done manually in ReferenceService, and only for the coach-facing /upload endpoint, not for the two pose-service upload callbacks.

No virus/content scanning anywhere in src/ — confirmed no ClamAV/AV-scanning dependency or call.

Path traversal: user-controlled input into storage keys is limited to the file extension only — reference.service.ts:144 derives ext from f.originalname.split('.').pop(), but the actual storage key is always sessions/${sessionId}/reference/${id}/original.${ext} (server-generated sessionId/id, only the extension comes from client input) — so no direct filename-based path traversal there. ReferenceStorageService.resolvePath() (reference-storage.service.ts:69-75) additionally guards local-disk paths: path.resolve(this.localRoot, key) must .startsWith(path.resolve(this.localRoot)) or it throws — a defense-in-depth check against ../ traversal in the key parameter used by saveBuffer/stat/createReadStreamForKey. The ReferenceMediaController.extractKey() (reference.controller.ts:321-328) derives key from the URL path itself (req.path.slice(...), decodeURIComponent) for the streaming/HEAD routes — this key also passes through verifySignature() (HMAC over key:exp) before use, so an attacker can't request an arbitrary un-signed key even if they could craft a traversal string.

10. Storage / S3 Integration
Two independent storage components:

reference/reference-storage.service.ts (full file read) — dual-mode:

S3 mode (when S3_REFERENCE_VIDEOS_BUCKET env var is set, :46,49-51): uses @aws-sdk/client-s3 S3Client constructed with only { region } (:50) — no explicit credentials in code, meaning it relies on the AWS SDK v3 default credential provider chain (env vars AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, shared config file, or IAM role) — confirmed by the .env.example comment "credentials come from the standard AWS provider chain — env vars, shared config, or an IAM role." Uploads via PutObjectCommand (:86-90), reads via getSignedUrl(s3Client, new GetObjectCommand(...), { expiresIn }) (:137-139) — i.e. presigned GET URLs, not direct SDK reads, not CloudFront in this path.
Local-disk mode (fallback, no bucket configured, :52-57): writes under path.join(process.cwd(), 'uploads', 'reference-videos') (:38), served back through ReferenceMediaController's own HMAC-signed /reference/media/* route (reference.controller.ts:289-366) with byte-range support for video seeking (:353-365).
Bucket name (S3_REFERENCE_VIDEOS_BUCKET) and region (AWS_REGION, default 'us-east-1') are both env-driven (:46-47) — but neither is declared in config.schema.ts (see §5).
HMAC signing secret for local-mode URLs and pose-service callback tokens reuses jwt.secret (:44) — i.e. no separate signing secret is configured for this purpose.
media/cloudfront-signer.ts (CloudFrontSigner, full file read) — used only by ClipsService (clips/clips.service.ts:19,38,289) to sign clip/recording playback URLs:

Reads cloudfront.domain/cloudfront.keyPairId/cloudfront.privateKey from config (:14-16).
If any are missing, sets isMockEnabled = true (:18-23) and signUrl() returns a fake URL suffixed ?Expires=...&Signature=mock_sig_dev_only&Key-Pair-Id=mock-keypair (:37-39) — dev-only fallback, logged as a warning at boot.
In real mode: builds a CloudFront canned policy JSON, signs it with createSign('RSA-SHA1') using the configured PEM private key (:41-59), base64-encodes and URL-safe-escapes the signature (:60-66), returns a query-string-signed URL (Expires, Signature, Key-Pair-Id) with a default TTL of 900s (:30).
Note: CloudFrontSigner itself never uploads anything — it only signs playback URLs for objects that must already exist in S3/CDN. The actual upload of session recordings is handled entirely by LiveKit's own Egress service (media/egress.service.ts:53-83,126-163), which is configured with an S3Upload({ bucket: this.bucketName, region: this.region }) object (:55-58,128-131) handed to LiveKit's EgressClient — LiveKit's egress worker (a separate process/service, not apps/api) performs the actual S3 write using its own credentials; apps/api never handles those video bytes directly for LiveKit recordings.
EgressService's bucket/region (egress.service.ts:32-33) are env-driven via S3_RAW_RECORDINGS_BUCKET/AWS_REGION, same "not in config.schema.ts" gap noted in §5, plus the nodeEnv key bug noted there.
No IAM role assumption code (AssumeRole, STS) exists anywhere in src/ — all AWS access is either via the default credential provider chain (implicit IAM role if run on EC2/ECS/EKS, or explicit env vars) or delegated entirely to LiveKit's own egress process.

11. Queue / Background / Scheduled Jobs
RefreshTokenCleanupService (auth/refresh-token-cleanup.service.ts, full file read) is confirmed the only background/scheduled job mechanism in apps/api:

onModuleInit() (:20-27) starts a plain setInterval(..., CLEANUP_INTERVAL_MS) where CLEANUP_INTERVAL_MS = 60 * 60 * 1000 (hourly, :5), calling refreshTokenService.purgeExpired().
timer.unref?.() (:26) so the interval doesn't keep the process alive on shutdown.
onModuleDestroy() (:29-31) clears the interval.
No @nestjs/schedule dependency exists in package.json (confirmed absent) — the comment at :8-11 explicitly notes this was a deliberate choice ("no new dependency needed for a single hourly interval").
No Bull/BullMQ dependency exists in package.json (confirmed absent) — no queue-based job processing anywhere in apps/api.

TODO/mentioned-but-not-implemented jobs found:

auth/refresh-token.service.ts:201 — doc-comment: /** Purge expired and old rotated-out tokens — run periodically (cron job, Phase 2). */ — this is stale/outdated now; the actual scheduling was implemented via RefreshTokenCleanupService's setInterval (not a "cron job"), so the comment describing it as still-pending Phase 2 work no longer matches reality.
auth/auth.service.ts:156,160 — // TODO: Phase 2 — send a time-limited signed reset link via email. and /** Password reset stub — to be implemented in Phase 2 with email infra. */ — confirmed genuinely unimplemented: forgotPassword()/resetPassword() exist as stubs with no email-sending integration anywhere in src/ (no nodemailer/SES/SendGrid dependency in package.json).
12. Caching / Redis Usage in apps/api
Redis is used for four distinct things in apps/api (all via ioredis or redis npm packages, both present in package.json), beyond the Socket.IO adapter:

Socket.IO horizontal-scaling adapter — realtime/redis-io.adapter.ts (full file read), uses the redis package's createClient + @socket.io/redis-adapter's createAdapter, connects to configService.get('redis.url') (:27), with retry/backoff logic (:34-37) and a recovery path that attaches the adapter later if Redis wasn't up at boot (:50-53,75-86).
Pose-command publisher — pose/pose-service.client.ts (full file read), uses ioredis, XADDs to Redis Stream pose:commands (:16,47-52) to tell any pose-service replica to start/stop a worker for a session/participant — this is the producer side of the pose-service's Redis Streams consumer.
Pose-keypoint relay consumer — pose/pose-relay.service.ts (full file read), ioredis client, consumes Redis Stream pose:keypoints via a consumer group pose-relay-group (:22-23,49), using XREADGROUP/XACK (:75-86,117,123,134,164,167) — forwards frames to the WebSocket gateway and persists them via PoseService, with an in-process circuit breaker (MAX_FAILURES = 5, :28) tracked in a plain Map, not Redis.
Cross-instance response cache — pose/pose.service.ts:19-24,42-70 — RECORDING_CACHE_PREFIX = 'pose:recording-cache:' — caches the recordingId lookup for a (sessionId, participantId) pair in Redis via plain GET/SET ... EX (:57,64-69), with a 1-hour TTL on hits (RECORDING_CACHE_HIT_TTL_SEC = 3600) and a 15s TTL on misses (RECORDING_CACHE_MISS_TTL_SEC = 15, negative-caching a '__none__' sentinel value, :24,58,66). Comment at :19-21 explicitly states this replaced an in-process Map specifically so every horizontally-scaled API instance shares the same cache.
No generic HTTP response caching (CacheModule/CacheInterceptor) exists anywhere — confirmed no @nestjs/cache-manager dependency. No session storage in Redis (sessions are JWT-based, not server-side sessions). No rate-limit-counter storage in Redis (the ThrottlerModule uses its default in-memory storage — no @nestjs/throttler-storage-redis or similar dependency present, and as noted in §8 the guard isn't even wired up).

13. WebSocket Architecture (realtime/realtime.gateway.ts)
Full file read (611 lines). Current complete picture:

Gateway config (:20-38): CORS origin read directly from process.env['CORS_ORIGIN']?.split(',') with a hardcoded 3-origin fallback list (:22-27) — this is a separate, independent CORS check from the main HTTP CORS setup in main.ts:37-45 (which does the same process.env['CORS_ORIGIN'] read+split independently). Both read the same env var and compute equivalent origin lists, but via two separate code paths that could drift (e.g. main.ts also sets credentials: true, methods, allowedHeaders for HTTP; the gateway only sets origin + credentials: true, :27). pingInterval: 25000 / pingTimeout: 60000 (:36-37), raised from Socket.IO defaults specifically to tolerate large concurrent video uploads saturating the same connection's uplink (comment :29-35).

Authentication (handleConnection, :54-73): JWT read from client.handshake.auth['token'] or client.handshake.query['token'] (:55-57) — not from an Authorization header (sockets can't easily send one). Verified via this.jwtService.verify(token) (:66); on success the decoded payload is stashed on client.data.user (:67) for later handlers to read; on missing/invalid token the socket is immediately .disconnect()ed (:60-61,71-72). No refresh-on-expiry — an expired token just fails verification and disconnects.

Room-naming conventions (used throughout):

session:${sessionId} — main session room (all approved participants + coach), e.g. :118,347,365,377,421,466,473.
session:${sessionId}:coach — coach-only room, e.g. :122,383,389,427,433.
session:${sessionId}:participant:${userId} — per-student targeted room (also used as a "lobby" holding room for not-yet-approved participants), e.g. :113,171,325,333,339,389,394,450.
Per-handler authorization pattern: every @SubscribeMessage handler re-checks client.data.user for presence (:80-83,183-186,242-245, etc.) and, for coach-only actions, re-derives coach status from the DB via assertCoachSession() (:141-155) or assertCoach() (:503-510) rather than trusting any client-claimed role — both helpers query sessionRepository.findOne() directly (the repository-in-gateway pattern noted in §1) and compare session.coachId === user.sub or user.role === 'platform_admin'.

In-gateway rate limiting: handleAnnotationDraw (:178-235) implements a hand-rolled per-socket rate limit — max 30 annotation:draw events/sec, tracked via client.data.annotationRateInfo (:194-206), a fixed 1-second sliding window counter. This is the only rate limiting anywhere in the WS gateway; no other @SubscribeMessage handler is rate-limited.

Handler inventory: session:join (:75-134, lobby vs. full-room admission logic), annotation:draw/undo/clear/delete (:178-321, fan-out via client.to(...) + async optimistic DB persistence through AnnotationsService), session:pin-track (:400-418), reference:state/annotate/undo/clear/close (:513-610, coach-only reference-video sync). Plus one-way emit methods called from other services/controllers (not @SubscribeMessage): emitReplayStart/Seek/End, emitPoseUpdate, emitBufferReplay(End), emitLobbyRequest/Approved/Rejected, emitSessionTerminated, emitRecordingActive/Degraded, emitReferenceOpen/Ready/AnnotationCreate/Update/Delete/ExportReady/ExportFailed (:323-501).

14. Monitoring Hooks
None present. Confirmed via package.json dependency listing (full list read) — no Sentry (@sentry/node), no DataDog (dd-trace), no Prometheus (prom-client), no OpenTelemetry (@opentelemetry/*), no APM agent of any kind. No custom metrics/counters class exists anywhere in src/ (no Counter, Histogram, Gauge, or similar pattern found via search) — the only quantitative in-process state tracked is the ad hoc Map-based circuit-breaker failure counts in pose/pose-relay.service.ts:27 and the WS rate-limit counter in realtime.gateway.ts:195 — neither is exported/exposed as a metric, both are purely internal control-flow state.

Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\sessions\sessions.service.ts (lines 2-151)
Grep "poseServiceClient\.|axios\.|fetch\(|httpService\.|await.*http\.post|await.*http\.get" (in c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\sessions\sessions.service.ts)
3 lines of output
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\infra\SCALING.md
Bash Search for nginx config, pose-service dockerfile, and read workflow files
IN
cd "c:\Users\jamya\Desktop\Fitness Platform\replaycoach" && find . -iname "*.conf" -not -path "*/node_modules/*" -not -path "*/venv/*" 2>/dev/null
echo "---nginx dirs---"
find . -iname "*nginx*" -not -path "*/node_modules/*" -not -path "*/venv/*" 2>/dev/null
echo "---pose-service dockerfile---"
find apps/pose-service -maxdepth 1 -iname "Dockerfile*"
echo "---workflows---"
cat .github/workflows/ci.yml
echo "===deploy-staging==="
cat .github/workflows/deploy-staging.yml

OUT
---nginx dirs---
---pose-service dockerfile---
---workflows---
name: CI

on:
  pull_request:
    branches: ['**']

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-typecheck:
    name: Lint & Typecheck
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Turborepo cache
        uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-

      - name: Build shared packages
        run: pnpm turbo build --filter=@replaycoach/types

      - name: Lint
        run: pnpm turbo lint

      - name: Typecheck
        run: pnpm turbo typecheck
===deploy-staging===
name: Deploy Staging

on:
  push:
    branches:
      - main

concurrency:
  group: deploy-staging
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # TODO (infra phase): Replace this placeholder with real deployment steps:
      # 1. Build Docker images (api, web)
      # 2. Push to Amazon ECR
      # 3. Update ECS service with new image digest
      # 4. Run DB migrations
      # 5. Smoke test staging health endpoint
      - name: Placeholder — deploy not yet implemented
        run: echo "Staging deploy not yet implemented. Wire up in infra phase."
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\pose\pose-service.client.ts
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\reference\reference.service.ts (lines 101-200)
Grep "async createClip" (in c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\clips\clips.service.ts)
41 lines of output
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\README.md
Bash
IN
cd "c:\Users\jamya\Desktop\Fitness Platform\replaycoach" && grep -rn "AWS_ACCESS_KEY_ID\|AWS_SECRET_ACCESS_KEY" apps/ --include="*.ts" --include="*.py" --include="*.example" -i 2>/dev/null

OUT
(Bash completed with no output)
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\web\app\(dashboard)\components\ClipCard.tsx (lines 2-41)
Grep "clip.title|\.title\}" (in c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\web)
3 lines of output
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\infra\terraform\main.tf
Bash
IN
cd "c:\Users\jamya\Desktop\Fitness Platform\replaycoach" && find apps/api/src/organizations apps/api/src/teams apps/api/src/users -iname "*.dto.ts"

OUT
apps/api/src/organizations/organization.dto.ts
apps/api/src/teams/teams.dto.ts
apps/api/src/users/user.dto.ts
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\infra\terraform\modules\s3\outputs.tf
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\teams\teams.dto.ts
Bash Search for backup and monitoring references
IN
cd "c:\Users\jamya\Desktop\Fitness Platform\replaycoach" && echo "=== backup/pg_dump refs ===" && grep -rln "pg_dump\|backup\|BACKUP" --include="*.md" --include="*.ts" --include="*.tf" --include="*.yml" . 2>/dev/null | grep -v node_modules | grep -v venv
echo "=== monitoring/log rotation refs ===" && grep -rln "logrotate\|datadog\|grafana\|prometheus\|cloudwatch\|sentry" --include="*.md" --include="*.ts" --include="*.tf" --include="*.yml" --include="*.json" . 2>/dev/null | grep -v node_modules | grep -v venv
echo "=== docs dir ===" && find docs -maxdepth 2 -type f 2>/dev/null
echo "=== .tools dir ===" && find .tools -maxdepth 2 -type f 2>/dev/null

OUT
=== backup/pg_dump refs ===
=== monitoring/log rotation refs ===
=== docs dir ===
docs/AI_PIPELINE.md
docs/AUTHENTICATION.md
docs/MEETING_REPLAY_ANNOTATION.md
=== .tools dir ===
.tools/livekit_server.zip
Grep "setHeader\('Cache-Control|res\.header|@Header\(" (in c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src)
1 line of output
Grep "redis|Redis|cache|Cache" (in c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\pose\pose.service.ts)
14 lines of output
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\users\user.controller.ts
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\auth\refresh-token-cleanup.service.ts
Grep "WorkerPool|new Map\(\)|new Set\(\)" (in c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src)
1 line of output
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\clips\clips.service.ts (lines 301-345)
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\realtime\redis-io.adapter.ts
You've hit your session limit · resets 2:20pm (Asia/Karachi)

Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\clips\clips.service.ts (lines 345-359)
Bash
IN
cd "c:\Users\jamya\Desktop\Fitness Platform\replaycoach" && wc -l apps/web/app/session/\[id\]/page.tsx

OUT
872 apps/web/app/session/[id]/page.tsx
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\sessions\sessions.service.ts (lines 2-71)
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\auth\jwt.strategy.ts
Grep "org\.name|team\.name|organization\.name" (in c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\web)
1 line of output
Bash Find type definitions for UserStatus, UserRole, TeamRole
IN
cd "c:\Users\jamya\Desktop\Fitness Platform\replaycoach" && grep -rn "UserStatus\|UserRole\|TeamRole" packages/types/src --include="*.ts" | grep "type\|=" | head -30

OUT
packages/types/src/auth.ts:6:export type UserRole = 'platform_admin' | 'studio_admin' | 'coach' | 'student';
packages/types/src/auth.ts:12:  role: UserRole;
packages/types/src/auth.ts:40:  role: Extract<UserRole, 'coach' | 'student'>;
packages/types/src/organization.ts:1:import type { UserRole } from './auth';
packages/types/src/organization.ts:34:export type TeamRole = 'lead' | 'member';
packages/types/src/organization.ts:49:  role: TeamRole;
packages/types/src/organization.ts:68:  role?: TeamRole;
packages/types/src/organization.ts:77:  role: Extract<UserRole, 'coach' | 'student'>;
packages/types/src/organization.ts:94:  role: Extract<UserRole, 'coach' | 'student'>;
packages/types/src/organization.ts:107:  role: Extract<UserRole, 'coach' | 'student'>;
packages/types/src/user.ts:1:import type { UserRole } from './auth';
packages/types/src/user.ts:9:export type UserStatus = 'active' | 'pending' | 'suspended' | 'disabled';
packages/types/src/user.ts:15:  role: UserRole;
packages/types/src/user.ts:18:  status: UserStatus;
packages/types/src/user.ts:32:export interface UpdateUserStatusDto {
packages/types/src/user.ts:33:  status: UserStatus;
packages/types/src/user.ts:38:  role?: UserRole;
packages/types/src/user.ts:39:  status?: UserStatus;
Bash
IN
cd "c:\Users\jamya\Desktop\Fitness Platform\replaycoach" && find apps/web/app/admin -type f

OUT
apps/web/app/admin/page.tsx
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\web\app\admin\page.tsx
Bash Final check for pm2/systemd/service files
IN
cd "c:\Users\jamya\Desktop\Fitness Platform\replaycoach" && grep -rin "pm2\|ecosystem" apps/api/package.json apps/web/package.json apps/pose-service/*.py 2>/dev/null
echo "---"
find . -iname "*.service" -not -path "*/node_modules/*" -not -path "*/venv/*" 2>/dev/null
echo "---systemd---"
find . -iname "*.systemd" -o -iname "*.unit" 2>/dev/null | grep -v node_modules

OUT
claude-sonnet-5 is temporarily unavailable, so auto mode cannot determine the safety of Bash right now. Wait briefly and then try this action again. If it keeps failing, continue with other tasks that don't require this action and come back to it later. Note: reading files, searching code, and other read-only operations do not require the classifier and can still be used.
Grep "from 'hls.js'|require\('hls.js'\)" (in c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\web)
1 line of output
Grep "configSchema|validationSchema|ConfigModule.forRoot" (in c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\app.module.ts)
3 lines of output
Read c:\Users\jamya\Desktop\Fitness Platform\replaycoach\apps\api\src\app.module.ts (lines 41-60)
Phase 7 Ground-Truth Security + Performance Report — ReplayCoach Monorepo
All paths below are relative to c:\Users\jamya\Desktop\Fitness Platform\replaycoach unless stated otherwise. This is a factual state report only — no recommendations, no changes made.

SECURITY
1. CSRF
No CSRF token mechanism exists anywhere in apps/api or apps/web. Confirmed by search: no csrf, double-submit, or x-csrf matches in any source file (only an unrelated code-comment hit about "double-submitted" UI clicks in apps/web/app/session/[id]/components/ReferenceAnalysisModal.tsx:185, and pnpm-lock noise).

apps/api/src/main.ts:37-45 — CORS config: origin is an explicit allow-list from CORS_ORIGIN env var (or hardcoded localhost defaults), credentials: true, methods GET,POST,PATCH,PUT,DELETE,OPTIONS. No custom Origin/Referer validation middleware anywhere.
apps/api/src/realtime/realtime.gateway.ts:20-28 — Socket.IO gateway CORS mirrors the same allow-list/credentials pattern; no Origin check beyond CORS.
Grep for headers.origin / x-requested-with across apps/api/src returned zero matches — no endpoint or guard inspects Origin/Referer headers as an authorization signal.
apps/api/src/auth/cookie.helper.ts:39,54-58 — SameSite defaults to 'strict' (confirmed, configurable via AUTH_COOKIE_SAMESITE to 'lax'/'none' for cross-domain deployments).
apps/web/middleware.ts:24-34 — the only Next.js middleware; it only checks presence of the non-httpOnly rc_has_session hint cookie for page-redirect UX, does nothing CSRF-related.
Conclusion: the SameSite=strict refresh cookie is the ONLY CSRF mitigation in the codebase. There is no double-submit cookie, no CSRF token header, and no Origin/Referer allow-list check on state-changing requests. Note also that when AUTH_COOKIE_SAMESITE is set to 'none' (required for cross-domain web/API deployments per the comment at cookie.helper.ts:54-55), this sole mitigation is explicitly disabled.

2. XSS
dangerouslySetInnerHTML: zero occurrences anywhere in apps/web (full-tree grep, no matches).
apps/api/src/annotations/annotations.service.ts:41-46 — sanitizeText() is confirmed as a text-sanitization point: truncates to 200 chars and strips <...> tags via text.replace(/<\/?[^>]+(>|$)/g, ''). Applied to annotation textContent at annotations.service.ts:144 (create) and annotations.service.ts:208 (tombstone).
This is the only server-side HTML-stripping/sanitization point found in apps/api. Grep for sanitiz (case-insensitive) across all of apps/ returns only annotations.service.ts and its spec file.
Other user-supplied text fields have length validation but no HTML-stripping:
apps/api/src/clips/clips.dto.ts:3-6 — CreateClipDto.title: @IsString() @IsNotEmpty() — no @MaxLength, no sanitization.
apps/api/src/organizations/organization.dto.ts:3-8,10-16 — org name: @MinLength(2) @MaxLength(255) — no sanitization.
apps/api/src/teams/teams.dto.ts:3-8,10-16 — team name: same, @MinLength(2) @MaxLength(255) — no sanitization.
apps/api/src/users/user.dto.ts:17,28 — displayName: no MaxLength/sanitization decorators visible on those lines beyond field declaration.
Are any of these rendered as raw HTML anywhere in apps/web? No. Clip title is rendered via plain JSX interpolation only: apps/web/app/(dashboard)/components/ClipPlaybackModal.tsx:254 ({clip.title}), apps/web/app/(dashboard)/components/ClipCard.tsx:85 ({clip.title}), apps/web/app/(dashboard)/coach/clips/page.tsx:245 ({sharingClip.title}) — all React-escaped, safe against XSS since dangerouslySetInnerHTML is never used.
Org/team names are not rendered anywhere in apps/web at all currently — grep for org.name/team.name/organization.name in apps/web returns zero matches, and apps/web/app/admin/page.tsx:1-3 is a stub (<div>TODO: Admin dashboard</div>) — the admin org/team management UI doesn't exist yet, so this is currently a moot risk, not a mitigated one.
3. SQL Injection
Grep for .query( across apps/api/src returns matches only inside apps/api/src/database/migrations/*.ts — these are TypeORM migration DDL calls (queryRunner.query(...)), all fixed schema DDL strings with no user-input interpolation. No raw .query() calls exist in any service/controller/repository code.
createQueryBuilder usage (5 files, all parameterized with named bind params, none use string-concatenation/template-literal building of SQL):
apps/api/src/teams/teams.service.ts:74-79 — .where('m.team_id IN (:...ids)', { ids: ... }).
apps/api/src/sessions/sessions.service.ts:146-152 — .where('participant.userId = :userId', { userId: user.sub }), .andWhere('participant.status = :status', ...).
apps/api/src/auth/refresh-token.service.ts:97-101 — .where('rt.family_id = :familyId', { familyId }).
apps/api/src/auth/refresh-token.service.ts:207-211 — .delete().where('rotated_at IS NOT NULL').andWhere('rotated_at < :rotatedCutoff', { rotatedCutoff }).
Conclusion: every database query in apps/api goes through TypeORM repository methods or parameterized query builder calls. No raw string-concatenated SQL was found anywhere outside migration DDL.
4. Secrets management
.gitignore (root) — .env, .env.local, .env.*.local, .env.development, .env.staging, .env.production are all ignored; only !**/.env.example is excepted (committed).
git ls-files | grep -i "\.env" confirms only .env.example, apps/api/.env.example, apps/web/.env.example are tracked by git.
Real .env files exist on disk but are untracked: apps/api/.env, apps/pose-service/.env, apps/web/.env.local.
Grep for sk_live|sk_test|AKIA|hardcoded|BEGIN PRIVATE KEY across apps/ returned only false positives (the English word "hardcoded" in code comments at apps/pose-service/export_renderer.py:34, apps/pose-service/config.py:82,85, apps/api/src/database/migrations/017_add_annotation_style_and_persistence.ts:7 — none are actual secrets).
No hardcoded secrets found in source.
Secrets are supplied purely via environment variables — no AWS Secrets Manager, no SSM Parameter Store integration anywhere in the codebase (no such imports/usage found).
apps/api/src/reference/reference-storage.service.ts:44 — notable finding: the HMAC signing secret for both the local-disk media-streaming signed URLs and the pose-service callback token is this.configService.getOrThrow<string>('jwt.secret') — i.e. it reuses the same JWT_SECRET used to sign access tokens, rather than a dedicated secret. There is no separate CALLBACK_TOKEN_SECRET env var anywhere in the codebase (confirmed via grep for CALLBACK_TOKEN/callbackToken — the only hits are the HMAC-token usage itself, not a distinct config key).
5. IAM (S3/CloudFront)
apps/api/src/reference/reference-storage.service.ts:50 — this.s3Client = new S3Client({ region }) — no credentials property passed. This means the AWS SDK v3 default credential provider chain is used (env vars → shared config/profile → container/ECS task role → EC2 instance profile), i.e. the code is written to support IAM role-based auth with no static keys embedded.
Grep for accessKeyId|secretAccessKey|credentials: across apps/api/src found zero matches tied to AWS SDK client construction (only unrelated credentials: true CORS options in main.ts:42 and realtime.gateway.ts:27).
Grep for AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY across all of apps/ (ts/py/example files) returned zero matches — these env vars are not referenced, expected, or documented anywhere in the code or .env.example files.
apps/api/src/media/cloudfront-signer.ts:6-24 — CloudFrontSigner uses CLOUDFRONT_KEY_PAIR_ID + CLOUDFRONT_PRIVATE_KEY (an RSA private key, not an IAM key) for signed-URL generation — this is CloudFront's canned-policy signing scheme (key-pair based), unrelated to IAM credentials/roles. If unset, it silently falls back to mock mode (isMockEnabled, cloudfront-signer.ts:18-23,37-39) rather than failing boot.
apps/api/src/config/config.schema.ts:39-41 — CLOUDFRONT_DOMAIN, CLOUDFRONT_KEY_PAIR_ID, CLOUDFRONT_PRIVATE_KEY are all Joi.string().optional() — not required at boot even in production.
Conclusion: the code is written for IAM-role-based S3 credential resolution (no static access keys anywhere); actual deployment posture (whether an EC2/ECS role is attached) is an infra-config question outside the codebase.
6. Signed URLs — every mechanism found
Three distinct signed-URL/token mechanisms exist:

CloudFront signed URLs for clips — apps/api/src/media/cloudfront-signer.ts:30-73. Algorithm: RSA-SHA1 canned-policy signing (createSign('RSA-SHA1'), line 57), AWS-mandated algorithm for CloudFront signed URLs. Default TTL: ttlSeconds: number = 900 (15 minutes, line 30). Called from apps/api/src/clips/clips.service.ts:289 with no explicit ttl override (this.cloudFrontSigner.signUrl(clip.s3Key)), so it uses the 900s default. Secret: CLOUDFRONT_PRIVATE_KEY env var (RSA private key), optional/mock-fallback as noted above.

HMAC exp/sig media streaming for reference videos (local-disk mode) — apps/api/src/reference/reference-storage.service.ts:125-156. Algorithm: HMAC-SHA256 over ${key}:${exp} (line 126), verified with timingSafeEqual (line 152). Default TTL: ttlSeconds = 6 * 60 * 60 = 6 hours (line 134, getPlaybackUrl). Consumed at apps/api/src/reference/reference.controller.ts:289-319 (ReferenceMediaController.streamMedia/headMedia), which parses ?exp=&sig= query params and rejects expired/invalid ones (line 297, 311). Signing secret: same jwt.secret (JWT_SECRET) as #4 above — not a dedicated secret.

Pose-service callback token — apps/api/src/reference/reference-storage.service.ts:159-171, callbackToken(refId)/verifyCallbackToken(). Algorithm: HMAC-SHA256 over reference-complete:${refId} (line 160), timingSafeEqual-compared (line 167). Stateless (no expiry — valid as long as the refId exists), gated by x-callback-token header on POST /reference/:refId/complete, /overlay, /export-upload, /export-failed (apps/api/src/reference/reference.controller.ts:192,206,238,241,257,260,279,282). Same jwt.secret reuse as #2.

S3 presigned GET URLs (production S3 mode for reference videos) — apps/api/src/reference/reference-storage.service.ts:137-139 — standard AWS SDK getSignedUrl (SigV4), same ttlSeconds default of 6 hours passed through (line 134/139).

All signing secrets are env-var sourced, not hardcoded. The two HMAC mechanisms (#2, #3) share the same underlying secret as the JWT access-token signer, meaning a JWT_SECRET compromise would also forge media-streaming URLs and pose-service completion callbacks.

7. Input validation edge cases
Path traversal:

apps/api/src/reference/reference-storage.service.ts:69-75 (resolvePath) — explicitly guards local-disk key resolution: path.resolve(this.localRoot, key) then throws Error('Invalid storage key: ...') if the resolved path doesn't start with the resolved localRoot. This is applied on every saveBuffer, stat, and createReadStreamForKey call in local-disk mode.
apps/api/src/reference/reference.service.ts:144-145 — S3 key construction: videoKey = \sessions/${sessionId}/reference/${id}/original.${ext}`—sessionIdcomes from the route param (validated to exist as a real session bySessionsGuard) and id is a server-generated UUID (reference.service.ts:120), so no direct user-controlled path-traversal vector there. extis derived fromf.originalname.split('.').pop()` (line 144) with no character sanitization — but it's only used as a file extension suffix, not a full path segment, and is bounded by the trailing-segment-only usage.
apps/api/src/reference/reference.controller.ts:321-328 (extractKey) — the media-streaming key is extracted directly from req.path after /reference/media/ and URL-decoded (line 325) with no explicit traversal check at this layer — traversal protection is deferred entirely to resolvePath() in the storage service (item above) and to the fact that any tampered key invalidates the HMAC signature (since sig is computed over the exact key string).
Ownership/authorization check consistency across CRUD endpoints: Reviewed every controller with DELETE/PATCH endpoints (sessions, clips, annotations, teams, organizations, users, reference). All had explicit ownership/role checks:

Sessions: apps/api/src/sessions/sessions.controller.ts — update (line 76), updateStatus (line 94), getPending (line 111), approve (line 129), reject (line 152), removeParticipant (line 240) all check session.coachId !== user.sub && user.role !== 'platform_admin'.
Clips: apps/api/src/clips/clips.service.ts:241-270 (assertClipAccess) — centralized IDOR check (creator, share record, or platform_admin), used by both getClip and clip annotations.
Annotations: apps/api/src/annotations/annotations.controller.ts:27-37 — the code comment itself documents a prior gap that was fixed: "Previously had no ownership check at all — any authenticated user could read any clip's annotations by ID", now calling clipsService.assertClipAccess (line 35).
Teams: apps/api/src/teams/teams.controller.ts — @Roles('platform_admin','studio_admin') + OrganizationGuard on create/update/delete (lines 29-72); addMember/removeMember (lines 76-95) intentionally have no @Roles decorator — service-layer enforces team-lead-or-org-admin, per the inline comment at line 74-75.
Organizations: apps/api/src/organizations/organization.controller.ts — every mutating endpoint has OrganizationGuard + @Roles('platform_admin','studio_admin') (lines 51-53, 69-72, 81-83, 99-102, 111-114).
Users: apps/api/src/users/user.controller.ts:70-83 (getById) — explicit org-scoping re-check for studio_admin (lines 76-81); setStatus (line 85-94) role-gated.
Reference: every mutating endpoint under apps/api/src/reference/reference.controller.ts:43-44 is behind class-level SessionsGuard, and service methods (present, syncAnnotations, createAnnotation, etc.) take user.sub/user.role for further checks.
No sibling-endpoint gap was found — every DELETE/PATCH endpoint reviewed has a matching ownership/role check; the one previously-missing check (clip annotations) is already documented as fixed in-code.

8. WebSocket security
apps/api/src/realtime/realtime.gateway.ts:54-73 (handleConnection) — JWT is read from client.handshake.auth['token'] or client.handshake.query['token'] (lines 55-57). If missing, client.disconnect() immediately (line 61). If present, this.jwtService.verify(token) (line 66) — this uses JwtService (not the same JwtStrategy as REST, but same underlying jsonwebtoken verify with expiry checked by default since ignoreExpiration isn't set to true here) — an expired or invalid token throws, caught at line 69-72, and the socket is disconnected. Confirmed: rejection happens at connection time, not per-event.
No re-validation after the initial handshake — client.data.user is set once at connect (line 67) and reused for the socket's entire lifetime; there is no periodic re-check of token expiry against subsequent events. A token that expires mid-connection remains "valid" for that socket until it disconnects/reconnects.
Every event handler re-derives authorization server-side, never trusting client-supplied identity:
All handlers pull const user = client.data?.['user'] (e.g. lines 80, 183, 242, 270, 301, 405, 518, 540, 561, 581, 599) — never data.userId/data.role from the message payload for auth decisions.
assertCoachSession (lines 141-155) and assertCoach (lines 503-510) both re-query the DB (sessionRepository.findOne) and compare session.coachId !== user.sub — the authenticated socket identity, not anything client-supplied.
studentIds arrays ARE accepted from the client payload (e.g. handleAnnotationDraw line 180, handleReferenceState line 515) but these are only used as broadcast targeting (which rooms to relay to — fanOutAnnotationEvent/emitToRoomOrStudents), not as an authorization decision — the sender's own coach/session authorization is checked independently via assertCoachSession/assertCoach before any targeting logic runs.
Grep confirms no instance of data.userId/data.role used for an authorization decision anywhere in the gateway — the only client-supplied identifiers used are for message routing targets, never for "am I allowed to do this."
9. Environment variables — boot validation (apps/api/src/config/config.schema.ts)
Required (Joi .required()), boot fails if missing:

DATABASE_URL (line 9)
JWT_SECRET — Joi.string().min(32).required() (line 12)
JWT_REFRESH_SECRET — Joi.string().min(32).required() (line 13)
LIVEKIT_API_KEY, LIVEKIT_API_SECRET — conditionally required only when NODE_ENV is production or staging (lines 26-35); optional in dev/test.
Optional with defaults:

PORT (default 3001, line 4), NODE_ENV (default development, line 5), CORS_ORIGIN (default http://localhost:3000, line 6), JWT_EXPIRY (default 15m, line 14), JWT_REFRESH_EXPIRY (default 7d, line 15), JWT_SESSION_EXPIRY (default 1d, line 16), AUTH_COOKIE_SAMESITE (default 'strict', line 19), REDIS_URL (default redis://localhost:6379, line 23), LIVEKIT_URL (default ws://localhost:7880, line 36).
Optional, no default (silently undefined if unset):

AUTH_COOKIE_DOMAIN (line 20), CLOUDFRONT_DOMAIN/CLOUDFRONT_KEY_PAIR_ID/CLOUDFRONT_PRIVATE_KEY (lines 39-41), POSE_SERVICE_URL (default given, line 44).
Security-relevant vars NOT present in the Joi schema at all (so entirely unvalidated at boot — no required check, no type check, no default enforced; read ad hoc via configService.get() elsewhere in the code): AWS_REGION (used at reference-storage.service.ts:47 with a hardcoded fallback 'us-east-1'), S3_REFERENCE_VIDEOS_BUCKET (reference-storage.service.ts:46), API_PUBLIC_URL (reference-storage.service.ts:43). Since NestJS ConfigModule.forRoot's default Joi validation options allow unknown keys, these vars being absent from the schema means the app boots successfully regardless of whether they're set, even though API_PUBLIC_URL is described in apps/api/.env.example as "Required once [API and pose-service] don't [share a machine]" — that requirement is not enforced by config.schema.ts.

Flagged as requested: there is no separate CALLBACK_TOKEN_SECRET — the callback-token and media-signature HMAC secret is silently the same as JWT_SECRET (see §4/§6), which IS required with a min(32) constraint, so it isn't "weak" in strength, but it is an undeclared secret-reuse (no schema entry exists for it because it was never designed as its own config value).

PERFORMANCE
10. Frontend bundle size
Ran npx next build fresh in apps/web (Next.js 14.2.30). Actual output:


Route (app)                              Size     First Load JS
┌ ○ /                                    524 B          87.7 kB
├ ○ /_not-found                          869 B            88 kB
├ ○ /admin                               140 B          87.3 kB
├ ○ /coach/clips                         2.42 kB         263 kB
├ ○ /coach/sessions                      5.06 kB         101 kB
├ ○ /coach/students                      140 B          87.3 kB
├ ○ /dashboard                           892 B          88.1 kB
├ ○ /login                               2.7 kB         98.9 kB
├ ○ /register                            2.7 kB         98.9 kB
├ ƒ /session/[id]                        175 kB          285 kB
├ ƒ /session/join/[id]                   4.62 kB         115 kB
├ ○ /student/clips                       1.49 kB         262 kB
└ ○ /student/sessions                    1.89 kB         101 kB
+ First Load JS shared by all            87.2 kB
  ├ chunks/240-3d486965fe0ffc45.js       31.6 kB
  ├ chunks/9862b9c0-b1141d548ece86bf.js  53.6 kB
  └ other shared chunks (total)          1.96 kB
ƒ Middleware                             26.5 kB
/session/[id] is confirmed the heaviest route: 175 kB own page size, 285 kB First Load JS — the meeting UI (LiveKit) + canvas annotation system.

next/dynamic / React.lazy usage: zero occurrences anywhere in apps/web (full-tree grep, no matches) — no lazy-loading is used anywhere in the frontend.
Heavy dependency hls.js is statically imported at apps/web/app/(dashboard)/components/ClipPlaybackModal.tsx:4 (import Hls from 'hls.js') — not lazy-loaded, but Next.js's default per-route code splitting means it only lands in the bundles of pages that import ClipPlaybackModal (consistent with /coach/clips at 263 kB and /student/clips at 262 kB being the two next-heaviest routes after /session/[id], versus ~88-101 kB for routes that don't touch it).
@livekit/components-react/livekit-client are statically imported directly in apps/web/app/session/[id]/page.tsx:4 — eagerly loaded whenever that route is visited (unavoidably, since it's the meeting page itself), contributing to the 285 kB First Load JS figure; no next/dynamic split is applied to LiveKit or the canvas/annotation components within that route.
11. Database query performance (brief)
apps/api/src/sessions/sessions.service.ts:120-152 (findAll) — no pagination anywhere: platform_admin gets this.sessionRepository.find({ order: { scheduledAt: 'DESC' } }) (lines 122-124) with zero take/skip/limit — a full-table unpaginated fetch that grows unbounded with total session count.
apps/api/src/clips/clips.service.ts:147-170 (getClips) — coach/admin path (line 157-161) fetches all matching clips with relations: ['session', 'session.participants', 'session.participants.user'] — no pagination, and a 3-level relation join fanning out per clip.
apps/api/src/sessions/sessions.service.ts:68-73 (findById) — loads relations: ['coach', 'organization', 'participants', 'participants.user'] on every single-session fetch — moderate join fan-out but not obviously pathological for a single row.
No SELECT * string literals found (all TypeORM .find()/query-builder calls, which select entity columns, not raw SELECT *).
12. Caching
No HTTP response caching anywhere — grep for Cache-Control, ETag, @Header(, res.header across apps/api/src returns no hits except an unrelated res.headersSent check in apps/api/src/common/interceptors/request-id.interceptor.ts:26. apps/web/next.config.mjs:1-18 has no headers() function configured.
No general-purpose in-memory or Redis caching of read-heavy data (session metadata, user profile, etc.) — findAll/findById/getClips/getMe all hit the DB directly every call.
The only caching found in the codebase is narrowly scoped to the pose pipeline: apps/api/src/pose/pose.service.ts:19-21,43-64 — a Redis-backed cache (pose:recording-cache: prefix) for recording lookups, explicitly noted in-code as "shared across API instances" rather than a general API response cache. This does not cover session/user/clip metadata endpoints.
13. API response time — synchronous heavy work
apps/api/src/reference/reference.service.ts:103,146 (upload) — await this.storage.saveBuffer(videoKey, f.buffer) (line 146) runs synchronously in the request path of POST /sessions/:id/reference/upload. Given MAX_UPLOAD_BYTES = 500 * 1024 * 1024 (500MB, reference.controller.ts:41), this can mean writing up to 500MB to either local disk or S3 (via PutObjectCommand, reference-storage.service.ts:86-90) before the HTTP response is sent — a potentially multi-second-to-tens-of-seconds synchronous operation in the request/response cycle.
By contrast, the actual pose-service call in the same flow is explicitly not awaited synchronously: this.kickOffPoseProcessing(saved).catch(...) (reference.service.ts:159-161) is fire-and-forget.
apps/api/src/pose/pose-service.client.ts:34-58 — session pose-worker start/stop (startWorker/stopWorker, called synchronously with await from sessions.service.ts:62,285,345,354) is implemented as a Redis Stream XADD publish (redis.xadd, line 47), not an HTTP call to the pose-service — this is fast and does not block on pose-service availability/latency.
No other synchronous S3/pose-service HTTP call was found in a hot request path (clip creation clips.service.ts:46- only writes DB rows and computes an S3 key string, no synchronous upload).
14. Video processing / pose detection performance
Covered in docs/AI_PIPELINE.md — not re-researched per instruction.

15. Memory/CPU
apps/api/src has no unbounded in-memory Map/Set at module scope — full-tree grep for WorkerPool, new Map(), new Set() returns zero matches in apps/api/src. RealtimeGateway's per-socket rate-limit state (client.data.annotationRateInfo, realtime.gateway.ts:195,206) is attached to the socket object itself, not a server-side collection, so it's garbage-collected automatically when the socket disconnects — no leak risk found server-side.
apps/web/app/session/[id]/components/TrackBufferManager.tsx — the 70-second rolling video buffer (WINDOW_MS = 70_000, line 8):
Per-participant chunk array eviction is correctly bounded: ondataavailable (lines 58-68) pushes 1s chunks and evicts everything older than Date.now() - WINDOW_MS on every chunk (while (arr.length && arr[0]!.ts < cutoff) arr.shift(), line 66) — so each active participant's buffers.current entry is capped at ~70 chunks regardless of meeting length.
However, buffers.current and headers.current (both Map<string, ...> keyed by participant identity, lines 29 and 37) are never cleaned up when a participant permanently leaves — the recorder is stopped and removed from the recorders map when its track disappears (lines 73-77), but the corresponding entries in buffers.current/headers.current are only deleted when that same participant ID gets a new track later (lines 50-51 inside the "fresh MediaRecorder" branch), not on departure. In a long meeting with many distinct participants rotating through (e.g., a coach running back-to-back sessions or a room with high student turnover, if TrackBufferManager instance is long-lived across such churn), this accumulates one stale header Blob + up to ~70 stale chunk Blobs per departed participant that's held in memory for the lifetime of the browser tab.
16. WebRTC performance — <LiveKitRoom> RoomOptions
Confirmed landed in code — apps/web/app/session/[id]/page.tsx:390-405:


<LiveKitRoom
  token={token ?? undefined}
  serverUrl={url ?? undefined}
  connect={true}
  audio={true}
  video={true}
  options={{
    adaptiveStream: true,
    dynacast: true,
  }}
  ...
Both adaptiveStream: true and dynacast: true are explicitly set (lines 403-404), with inline comments explaining the rationale (lines 397-402). These are not defaults being relied upon — they are explicitly configured in the options object passed to <LiveKitRoom>.

Grep "pm2|ecosystem" (in c:\Users\jamya\Desktop\Fitness Platform\replaycoach, glob: !{node_modules,venv}/**)
1 line of output
Bash Confirm duplicate index on users.email
IN
cd "c:\Users\jamya\Desktop\Fitness Platform\replaycoach" && grep -n "IDX_users_email\|UQ_users_email" apps/api/src/database/migrations/002_create_users.ts

OUT
25:        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
33:      CREATE INDEX "IDX_users_email" ON "users" ("email")
You've hit your session limit · resets 2:20pm (Asia/Karachi)

Now I have thorough ground truth. Here is the complete report.

Phase 6 Ground Truth Report — Database & Infrastructure
Repo root: c:\Users\jamya\Desktop\Fitness Platform\replaycoach

1. Entity & Migration Inventory
Entity files (9 files, 18 @Entity classes)
File	Entities	Description
apps/api/src/users/user.entity.ts	User	Platform user account; has @DeleteDateColumn soft delete
apps/api/src/organizations/organization.entity.ts	Organization	Coaching studio/org; jsonb settings/branding
apps/api/src/organizations/org-invite.entity.ts	OrgInvite	Org/team invite token record
apps/api/src/teams/team.entity.ts	Team	Org-scoped group
apps/api/src/teams/team-member.entity.ts	TeamMember	Team membership + per-team role
apps/api/src/sessions/session.entity.ts	Session	A coaching meeting/session
apps/api/src/sessions/session-participant.entity.ts	SessionParticipant	User's membership in a session
apps/api/src/auth/refresh-token.entity.ts	RefreshToken	One row per active/recently-rotated refresh token
apps/api/src/database/entities/others.entities.ts	Recording, PoseKeypointFrame, ReplayEvent, Clip, Annotation, ClipShare, Subscription, ReferenceVideo, TrackedAnnotation, AuditLog (10 entities)	See per-entity notes below
others.entities.ts breakdown (line numbers as-read):

Recording (L15-53) — one LiveKit egress track/composite recording per session/participant
PoseKeypointFrame (L56-77) — per-frame pose keypoints JSON tied to a recording
ReplayEvent (L80-110) — a "replay/rewind" trigger event in a session
Clip (L113-157) — a saved clip, either cut from a recording or from a reference video
Annotation (L160-217) — legacy pixel/per-frame telestrator annotation on a clip or replay event
ClipShare (L220-241) — clip-to-user sharing grant
Subscription (L244-263) — Stripe billing subscription per org (no entity-level relation object)
ReferenceVideo (L266-343) — coach-uploaded external analysis video
TrackedAnnotation (L349-394) — joint-attached annotation on a reference video (tracks joints, not pixels)
AuditLog (L396-428) — actor/action/resource audit trail
Migrations (all 17, in order, apps/api/src/database/migrations/)
#	File	Summary
001	001_create_organizations.ts	Creates organizations table (id, name, plan_tier, created_at)
002	002_create_users.ts	Creates Postgres ENUM user_role; creates users table with FK_users_org → organizations ON DELETE SET NULL; creates IDX_users_email (in addition to the table's own UQ_users_email)
003	003_create_refresh_tokens.ts	Creates refresh_tokens with FK_refresh_tokens_user → users ON DELETE CASCADE; indexes on family_id, user_id
004	004_create_org_invites.ts	Creates org_invites with FK_org_invites_org → organizations ON DELETE CASCADE, FK_org_invites_inviter → users ON DELETE CASCADE
005	005_create_session_features.ts	Big migration: creates sessions, session_participants, recordings, pose_keypoint_frames, replay_events, clips, annotations, clip_shares, subscriptions, audit_logs — all core FKs, several CHECK constraints, several indexes (see §2/§3/§4)
006	006_add_session_access_control.ts	Adds sessions.access_type + sessions.invite_code (unique) + CK_sessions_access_type; adds session_participants.status + CK_session_participants_status
007	007_align_recordings_with_egress.ts	Adds recordings.egress_id (unique, backfilled), makes participant_id nullable, normalizes track_type values, adds CK_recordings_track_type
008	008_add_refresh_token_rotated_at.ts	Adds refresh_tokens.rotated_at + index (perf fix for O(n) argon2 scan, per migration's own doc comment)
009	009_add_perf_indexes.ts	Adds IDX_annotations_replay_event_id, IDX_annotations_clip_frame (clip_id, frame_timestamp_ms), unique IDX_clip_shares_clip_user
010	010_create_reference_videos.ts	Creates reference_videos table with FKs to sessions/users, CK_reference_videos_status, index on session_id
011	011_add_clip_type_reference_video.ts	Adds clips.clip_type + clips.reference_video_id + FK_clips_reference_video → reference_videos ON DELETE SET NULL + CK_clips_clip_type
012	012_add_refresh_token_lookup_hash.ts	Adds refresh_tokens.token_lookup_hash (unique index) — O(1) lookup perf fix, documented in the migration's own header comment
013	013_add_reference_video_overlay_key.ts	Adds reference_videos.overlay_video_key (nullable)
014	014_add_annotation_tracking.ts	Adds reference_videos.analysis_mode/keypoint_format/export_video_key; creates tracked_annotations table with FK_tracked_annotations_ref → reference_videos ON DELETE CASCADE + index
015	015_add_remember_me_to_refresh_tokens.ts	Adds refresh_tokens.remember_me boolean default false
016	016_add_users_orgs_teams_invites.ts	Adds users.status/email_verified/email_verified_at/last_login_at/deleted_at + 2 indexes; adds organizations.settings/branding/created_by + FK; creates teams + team_members tables with FKs/indexes/unique; adds org_invites.team_id + FK, unique index on invite_token, index on invited_email
017	017_add_annotation_style_and_persistence.ts	Adds annotations.color/thickness/persist_until_cleared
2. Relationships & Foreign Keys
Cross-checked every @ManyToOne in every entity against the migration SQL that created the table/column. All FK-implying relations that ARE declared as @ManyToOne decorators have a matching real CONSTRAINT … FOREIGN KEY … ON DELETE … — I found no case of an entity-declared relation lacking a DB-level FK. Detail:

Entity.relation	Column	FK constraint	ON DELETE	Match
User → Organization	org_id	FK_users_org (002:26-28)	SET NULL	entity has no explicit onDelete on the decorator (user.entity.ts:78-80), DB is SET NULL — decorator/DB drift (see note below), not a missing-FK
RefreshToken → User	user_id	FK_refresh_tokens_user (003:16-18)	CASCADE	matches (refresh-token.entity.ts:82, explicit CASCADE)
OrgInvite → Organization	org_id	FK_org_invites_org (004:19-21)	CASCADE	entity decorator has no onDelete (org-invite.entity.ts:46-48) — drift, DB is CASCADE
Team → Organization	org_id	FK_teams_org (016:46-47)	CASCADE	matches exactly (team.entity.ts:33, explicit CASCADE)
TeamMember → Team	team_id	FK_team_members_team (016:62-63)	CASCADE	matches (team-member.entity.ts:35)
TeamMember → User	user_id	FK_team_members_user (016:64-65)	CASCADE	matches (team-member.entity.ts:39)
Session → User (coach)	coach_id	FK_sessions_coach (005:22)	CASCADE	matches (session.entity.ts:53)
Session → Organization	org_id	FK_sessions_org (005:23)	SET NULL	matches (session.entity.ts:57)
SessionParticipant → Session	session_id	FK_session_participants_session (005:43)	CASCADE	matches (session-participant.entity.ts:39)
SessionParticipant → User	user_id	FK_session_participants_user (005:44)	CASCADE	matches (session-participant.entity.ts:43)
Recording → Session	session_id	FK_recordings_session (005:61)	CASCADE	matches (others.entities.ts:46)
Recording → User (participant)	participant_id	FK_recordings_participant (005:62)	CASCADE	matches (others.entities.ts:50), nullable added by migration 007
PoseKeypointFrame → Recording	recording_id	FK_pose_keypoint_frames_recording (005:79)	CASCADE	matches (others.entities.ts:74)
ReplayEvent → Session	session_id	FK_replay_events_session (005:98)	CASCADE	matches (others.entities.ts:103)
ReplayEvent → User (initiator)	initiated_by	FK_replay_events_actor (005:99)	CASCADE	matches (others.entities.ts:107)
Clip → Session	session_id	FK_clips_session (005:116)	CASCADE	matches (others.entities.ts:150)
Clip → User (creator)	created_by	FK_clips_creator (005:117)	CASCADE	matches (others.entities.ts:154)
Annotation → Clip	clip_id	FK_annotations_clip (005:141)	CASCADE	matches (others.entities.ts:206)
Annotation → ReplayEvent	replay_event_id	FK_annotations_replay (005:142)	CASCADE	matches (others.entities.ts:210)
Annotation → User (creator)	created_by	FK_annotations_creator (005:143)	CASCADE	matches (others.entities.ts:214)
ClipShare → Clip	clip_id	FK_clip_shares_clip (005:155)	CASCADE	matches (others.entities.ts:234)
ClipShare → User (recipient)	shared_with_user_id	FK_clip_shares_recipient (005:156)	CASCADE	matches (others.entities.ts:238)
ReferenceVideo → Session	session_id	FK_reference_videos_session (010:23)	CASCADE	matches (others.entities.ts:336)
ReferenceVideo → User (uploader)	uploaded_by_user_id	FK_reference_videos_uploader (010:24)	CASCADE	matches (others.entities.ts:340)
TrackedAnnotation → ReferenceVideo	reference_video_id	FK_tracked_annotations_ref (014:29-30)	CASCADE	matches (others.entities.ts:391)
AuditLog → User (actor)	actor_user_id	FK_audit_logs_actor (005:186)	SET NULL	matches (others.entities.ts:425)
Columns that reference users/other tables by naming convention but have NEITHER an entity @ManyToOne NOR any FK constraint in any migration (genuine unenforced "relations" — flagged per your ask):

tracked_annotations.created_by (uuid, NOT NULL) — declared in others.entities.ts:385-386 as a bare @Column, no relation object, and migration 014 never adds a FK for it (only FK_tracked_annotations_ref on reference_video_id, see 014_add_annotation_tracking.ts:29-31). This is the one column in the whole schema that points at users.id with zero DB enforcement and zero ORM relation — a deleted user's id can remain referenced here indefinitely, and there's nothing stopping an invalid uuid from being written.
Columns where the DB HAS a real FK constraint but the entity does NOT model it as a @ManyToOne relation (DB stricter than the ORM model — not a gap in enforcement, just an incomplete entity graph, worth knowing since relations: [...] eager-load calls can never traverse these):

Organization.createdBy → FK_organizations_created_by (016:34-35, SET NULL) — organization.entity.ts has no relation object for it
Team.createdBy → FK_teams_created_by (016:48-49, SET NULL) — team.entity.ts has no relation object
OrgInvite.invitedBy → FK_org_invites_inviter (004:22-24, CASCADE) — org-invite.entity.ts has no relation object
OrgInvite.teamId → FK_org_invites_team (016:74-75, SET NULL) — org-invite.entity.ts has no relation object
ReplayEvent.targetParticipantId → FK_replay_events_target (005:100, SET NULL) — others.entities.ts ReplayEvent has no relation object for targetParticipantId, only the bare column (L91-92)
Clip.referenceVideoId → FK_clips_reference_video (011:11-12, SET NULL) — others.entities.ts Clip has no relation object, only bare column (L144-145)
Subscription.orgId → FK_subscriptions_org (005:170, CASCADE) — Subscription entity has no relation object at all
Note on onDelete decorator drift: several entities (User.organization, OrgInvite.organization) declare the @ManyToOne without an explicit onDelete option in the TypeScript decorator, while the actual migration-created FK is SET NULL/CASCADE. Since synchronize: false everywhere, this has no runtime effect today (the DB constraint governs actual behavior), but it means the entity metadata doesn't accurately describe the schema — a future synchronize: true run or migration:generate diff against these entities would try to change the FK's delete behavior to TypeORM's default (NO ACTION).

3. Indexes
All explicit indexes (migrations + entity @Index decorators — verified to correspond 1:1 to migration DDL)
Table	Columns	Name	Unique	Source
users	email	UQ_users_email (constraint)	Y	002:25
users	email	IDX_users_email	N	002:33 (redundant with the UNIQUE constraint above — Postgres already auto-creates a unique index for UQ_users_email; this is a duplicate index on the same column)
users	deleted_at	IDX_users_deleted_at	N	016:26
users	org_id	IDX_users_org_id	N	016:27
refresh_tokens	family_id	IDX_refresh_tokens_family_id	N	003:23
refresh_tokens	user_id	IDX_refresh_tokens_user_id	N	003:26
refresh_tokens	rotated_at	IDX_refresh_tokens_rotated_at	N	008:13-15
refresh_tokens	token_lookup_hash	IDX_refresh_tokens_lookup_hash	Y	012:32-34
org_invites	invite_token	IDX_org_invites_token	Y	016:77
org_invites	invited_email	IDX_org_invites_email	N	016:78
sessions	coach_id, status	IDX_sessions_coach_status	N	005:28
sessions	livekit_room_name	UQ_sessions_room (constraint)	Y	005:20
sessions	invite_code	UQ_sessions_invite_code	Y	006:27
session_participants	session_id, user_id	UQ_session_participants_session_user	Y	005:41
recordings	session_id, participant_id	IDX_recordings_session_participant	N	005:67
recordings	egress_id	IDX_recordings_egress_id	Y	007:52-54
pose_keypoint_frames	recording_id, frame_timestamp_ms	IDX_pose_frames	N	005:84
clips	session_id	IDX_clips_session	N	005:122
clips	created_by	IDX_clips_creator	N	005:125
annotations	replay_event_id	IDX_annotations_replay_event_id	N	009:9-11
annotations	clip_id, frame_timestamp_ms	IDX_annotations_clip_frame	N	009:15-17
clip_shares	clip_id, shared_with_user_id	IDX_clip_shares_clip_user	Y	009:21-23
audit_logs	actor_user_id, created_at	IDX_audit_logs_actor_time	N	005:191
audit_logs	resource_type, resource_id	IDX_audit_logs_resource	N	005:194
reference_videos	session_id	IDX_reference_videos_session	N	010:30
tracked_annotations	reference_video_id	IDX_tracked_annotations_ref	N	014:35
teams	org_id	IDX_teams_org_id	N	016:52
team_members	team_id, user_id	UQ_team_members_team_user	Y	016:66
team_members	user_id	IDX_team_members_user_id	N	016:69
Missing-index gaps (FK/filter columns queried by services with no covering index)
Grepped every .find(/.findOne(/.findOneBy(/.findBy( with a where: clause across apps/api/src (non-spec) and cross-referenced against §3's index table:

org_invites.org_id — no index at all (only the FK). Queried in organization.service.ts:98 (listMembers — actually queries users.org_id, which IS indexed) and directly at organization.service.ts:154 this.inviteRepo.find({ where: { orgId }, order: { createdAt: 'DESC' } }) and organization.service.ts:160/170 this.inviteRepo.findOne({ where: { id: inviteId, orgId } }). No index on org_invites.org_id — every "list invites for this org" / "find this invite in this org" query is a sequential scan once the table grows.
reference_videos.uploaded_by_user_id — no index; not currently queried directly by that column alone (only via sessionId, which IS indexed), so lower priority, but the FK column itself has zero index coverage.
replay_events.session_id / initiated_by / target_participant_id — the replay_events table (created in 005_create_session_features.ts:88-102) has no explicit index of any kind, not even on session_id, despite 3 FK columns. replay.service.ts:31 does this.sessionRepository.findOne({ where: { id: sessionId } }) (fine, PK lookup on sessions), but any lookup of replay events themselves by session_id (which the replay/annotation flow does implicitly via the annotations.replayEvent.sessionId relation filters in annotations.service.ts:165 and :178-180, e.g. where: { id, replayEvent: { sessionId } }) has to join through an unindexed replay_events.session_id.
annotations.created_by — no index. annotations.service.ts:172-184 filters where: { createdBy: userId, frameTimestampMs, clipId: IsNull(), replayEvent: { sessionId } } (undo-last-annotation) — created_by participates in this filter with no covering index (the only annotations indexes are on replay_event_id alone and (clip_id, frame_timestamp_ms)).
clip_shares.shared_with_user_id alone — only covered as the second column of the composite unique index (clip_id, shared_with_user_id), which cannot be used efficiently for a lookup that filters on shared_with_user_id alone. clips.service.ts:163-166 does exactly that: this.clipShareRepository.find({ where: { sharedWithUserId: userId }, relations: [...] }) — a student's "clips shared with me" query — this is a full scan of clip_shares today (leftmost-prefix rule means the composite index can't serve a shared_with_user_id-only predicate).
subscriptions.org_id — no index (only the FK); no current service code was found querying it, but it's an FK column with zero index coverage if/when billing lookups are added.
teams.created_by — no index (nullable FK column), not currently queried by that column.
session_participants.user_id alone — only covered as the trailing column of the unique composite (session_id, user_id); a query filtering on user_id alone (e.g. "all sessions this user participated in") would not use that index efficiently. I did not find such a query in the current service code, but it's a latent gap given the FK.
recordings.participant_id alone — same leftmost-prefix issue: only indexed as the trailing column of (session_id, participant_id).
4. Constraints
CHECK constraints (DB-level, from migrations)
Table.column	Constraint	Allowed values	Migration
sessions.status	CK_sessions_status	scheduled, live, ended, processed, archived	005:21
sessions.access_type	CK_sessions_access_type	public, lobby	006:32
session_participants.role_in_session	CK_session_participants_role	coach, student	005:42
session_participants.status	CK_session_participants_status	pending, approved, rejected	006:42
recordings.status	CK_recordings_status	recording, finalizing, ready, failed	005:60
recordings.track_type	CK_recordings_track_type	participant, composite	007:47-49
clips.clip_type	CK_clips_clip_type	recording, reference	011:13
reference_videos.status	CK_reference_videos_status	uploading, processing, ready, failed	010:25
users.role	Postgres ENUM type user_role (stronger than CHECK)	platform_admin, studio_admin, coach, student	002:8-11
App-layer-only "enum-like" string columns — no CHECK constraint anywhere, TypeScript union type is the only guard:
users.status (VARCHAR(20), added 016:20) — TS UserStatus = 'active'|'pending'|'suspended'|'disabled' (packages/types/src/user.ts:9), no DB CHECK
team_members.role (VARCHAR(20), 016:59) — TS TeamRole = 'lead'|'member' (packages/types/src/organization.ts:34), no DB CHECK
org_invites.role (VARCHAR(50), 004:12) — values 'coach'|'student' enforced only in service/DTO code, no DB CHECK
annotations.type (VARCHAR(50), 005:135) — free-form shape type string, no DB CHECK
annotations.color (VARCHAR(20) nullable, 017:21) — no format/hex validation at DB level
reference_videos.analysis_mode (VARCHAR(30), 014:9) — TS union 'full_body'|'annotation_tracking', no DB CHECK
reference_videos.keypoint_format (VARCHAR(20), 014:10) — TS union 'coco17'|'halpe26', no DB CHECK
tracked_annotations.shape_type (VARCHAR(20), 014:18) — TS union 'line'|'arrow'|'angle'|'point'|'circle', no DB CHECK
NOT NULL matching
Spot-checked every nullable/non-nullable flag across all 18 entities against the migration column definitions — no mismatches found. Every entity nullable: true/nullable: false (or field typed X | null vs. X) matches the corresponding migration's NULL/NOT NULL. Notable cases that were deliberately changed mid-schema-life and match on both sides: recordings.participant_id (NOT NULL in 005, relaxed to nullable in 007:24-26, entity others.entities.ts:25-26 reflects nullable: true).

UNIQUE constraints (full list, beyond what was already documented for you)
organizations — none beyond PK
users.email — UQ_users_email (002:25) — already known
sessions.livekit_room_name — UQ_sessions_room (005:20)
sessions.invite_code — UQ_sessions_invite_code (006:27)
session_participants (session_id, user_id) — UQ_session_participants_session_user (005:41) — already known
team_members (team_id, user_id) — UQ_team_members_team_user (016:66) — already known
recordings.egress_id — unique index IDX_recordings_egress_id (007:52-54) — not previously documented
refresh_tokens.token_lookup_hash — unique index IDX_refresh_tokens_lookup_hash (012:32-34) — not previously documented
clip_shares (clip_id, shared_with_user_id) — unique index IDX_clip_shares_clip_user (009:21-23) — not previously documented
org_invites.invite_token — unique index IDX_org_invites_token (016:77) — not previously documented
5. Soft Deletes
Confirmed: User is the ONLY soft-deletable entity in the entire schema. Grepped DeleteDateColumn|softDelete across all of apps/api/src:

user.entity.ts:75 — @DeleteDateColumn({ name: 'deleted_at' })
user.service.ts:105-107 — softDeleteSelf() calls this.userRepo.softDelete(id)
user.controller.ts:50 — calls softDeleteSelf
No other entity (Session, Organization, Clip, ReferenceVideo, Team, Recording, etc.) has a @DeleteDateColumn or any soft-delete column. All 17 other entities are hard-delete-only (or never deleted at all — several, like Session, have no delete path anywhere).

Hard deletes found (.remove(/.delete( on a repository, non-spec, non-migration)
Call	File:line	Target FK cascade	Result
this.annotationRepository.remove(annotation)	annotations.service.ts:169	Annotation has no dependents (leaf table)	safe
this.annotationRepository.remove(lastAnnotation)	annotations.service.ts:188	leaf table	safe
this.clipShareRepository.remove(toDelete)	clips.service.ts:333	leaf table	safe
this.inviteRepo.delete({ id: inviteId })	organization.service.ts:162	leaf table (nothing FKs to org_invites)	safe
this.trackedRepo.delete({ id: annId, referenceVideoId: refId })	reference.service.ts:501	leaf table	safe
this.teamRepo.delete({ id: teamId, orgId })	teams.service.ts:110	team_members.team_id has ON DELETE CASCADE (FK_team_members_team, 016:62-63); org_invites.team_id has ON DELETE SET NULL (FK_org_invites_team, 016:74-75)	safe — DB cascades correctly, no orphans
this.memberRepo.delete({ teamId, userId })	teams.service.ts:140	leaf table	safe
this.memberRepo.delete({ teamId: In(teams.map(…)), userId })	teams.service.ts:165	leaf table	safe
No entity with dependents is ever hard-deleted directly (User, Session, Organization, Clip, Recording, ReferenceVideo are never .delete()d/.remove()d anywhere in apps/api/src — they're only created/updated/soft-deleted-for-User). So the FK cascade-vs-orphan risk your question anticipates doesn't currently materialize in the code — every hard delete found targets a genuine leaf table or a table whose cascades are correctly configured in the DB.

6. Migrations Quality
Idempotency
Migrations are not written to be re-run-safe as a blanket pattern — most use bare CREATE TABLE/ALTER TABLE ADD COLUMN/CREATE INDEX with no IF NOT EXISTS guard (e.g. 001, 002, 003, 004, 005, 006, 010, 011, 013, 015, 016, 017 — 12 of 17). A handful do use IF NOT EXISTS/IF EXISTS defensively: 007_align_recordings_with_egress.ts (ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, CREATE UNIQUE INDEX IF NOT EXISTS), 008_add_refresh_token_rotated_at.ts (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS), 009_add_perf_indexes.ts (all three CREATE INDEX IF NOT EXISTS), 014_add_annotation_tracking.ts (DROP TABLE IF EXISTS only in down()). This inconsistency is stylistic, not a bug — TypeORM's migrations table (typeorm_migrations, auto-created) is the actual re-run guard (confirmed below), so a normal migration:run will never attempt to re-run an already-applied migration regardless of IF NOT EXISTS.

Migrations table / CLI DataSource wiring
apps/api/src/database/data-source.ts (read in full) exports AppDataSource, used by the three CLI scripts in apps/api/package.json:


"migration:run": "typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts"
"migration:revert": "typeorm-ts-node-commonjs migration:revert -d src/database/data-source.ts"
"migration:generate": "typeorm-ts-node-commonjs migration:generate -d src/database/data-source.ts"
migrations: ['src/database/migrations/*.ts'] (data-source.ts:24) is correctly globbed, so migration:run/migration:revert will pick up all 17 files and track them in TypeORM's default migrations history table — standard, correct behavior.

However, data-source.ts:23 sets entities: [Organization, OrgInvite, User, RefreshToken] — only 4 of the 18 entities, vs. the NestJS runtime TypeOrmModule.forRootAsync() in app.module.ts:69-88, which correctly registers all 18. Since synchronize: false in both, this doesn't affect migration:run/migration:revert (they just execute the SQL files, entities aren't consulted). But it means migration:generate (schema-diff auto-generation) is silently broken/dangerous for 14 of 18 tables — running migration:generate today would diff only organizations/org_invites/users/refresh_tokens against the live DB and would not "see" sessions, clips, annotations, teams, reference_videos, etc. at all, which for a diffing tool typically means it would propose no changes for those tables (since they're absent from both the entity metadata and irrelevant to the diff) — but it's a real drift between the two DataSource configs that would surprise anyone trusting migration:generate output.

down() completeness — spot-checked all 17 (not just 3-4)
Every migration has a non-empty, non-no-op down(). All 17 were read in full above; none has a placeholder or empty down() body. Detail on the 4 most recent (as requested):

017_add_annotation_style_and_persistence.ts:27-34 — drops the 3 columns it added (persist_until_cleared, thickness, color) — complete.
016_add_users_orgs_teams_invites.ts:81-111 — drops everything added, in reverse dependency order (invite index → org_invites FK/column → team_members/teams tables → organizations FK/columns → users indexes/columns) — complete and correctly ordered.
015_add_remember_me_to_refresh_tokens.ts:20-22 — drops the single column added — complete.
014_add_annotation_tracking.ts:39-47 — drops tracked_annotations table and the 3 reference_videos columns added — complete.
One notable down() reversibility caveat (not an emptiness issue, a data-loss-on-revert issue): 007_align_recordings_with_egress.ts:57-63 and 012_add_refresh_token_lookup_hash.ts:37-40 both reverse schema shape correctly but cannot restore data that was destructively transformed/backfilled in up() (e.g. 007's UPDATE recordings SET participant_id = NULL WHERE track_type = 'composite' and 012's lossy backfill of token_lookup_hash = id::text for pre-existing rows) — reverting these migrations will not restore the pre-migration data, only the pre-migration column shape. This is expected/documented behavior (both migrations have explanatory comments), not a bug, but worth noting as "down() runs but is lossy."

7. Transactions
Grepped queryRunner, .transaction(, manager.transaction across all of apps/api/src (excluding migrations and data-source.ts, which don't count) — zero matches. No queryRunner usage, no .transaction( call, no manager.transaction call anywhere in the application code. There is no DB transaction usage anywhere in this codebase. Every multi-step write is a sequence of independent repo.save()/repo.delete()/repo.update() calls.

Confirmed: OrganizationService.create() (your specific question)
apps/api/src/organizations/organization.service.ts:68-77:


68  const org = this.orgRepo.create({ name: dto.name, createdBy: actingUser.sub });
69  await this.orgRepo.save(org);
71  const user = await this.userService.findById(actingUser.sub);
72  user.orgId = org.id;
73  if (user.role === 'coach') user.role = 'studio_admin';
74  await this.userRepo.save(user);
77  await this.userService.incrementSessionVersion(user.id);
Confirmed NOT transactional — 3 separate writes (orgRepo.save L69, userRepo.save L74, incrementSessionVersion → userRepo.increment L77). A crash between L69 and L74 leaves an orphaned organizations row with no admin (createdBy points at a user whose orgId/role were never updated) — reproducing exactly the bug this method's own doc comment (L48-59) says it was written to fix, just via a different failure mode (crash instead of a missing assignment).

Every other multi-step write that looks like it should be transactional but isn't
Method	File:line sequence	Risk if interrupted between steps
OrganizationService.removeMember()	organization.service.ts:118 (teamsService.removeUserFromAllOrgTeams) → :120 (userRepo.save(target)) → :121 (incrementSessionVersion)	User could be dropped from teams but still show orgId unchanged, or vice versa
OrganizationService.acceptInvite()	organization.service.ts:212 (userRepo.save(user)) → :215 (teamsService.addMemberSystem, conditional) → :219 (inviteRepo.save(invite), marks usedAt) → :220 (incrementSessionVersion)	Invite could be consumed (usedAt set) without the user's orgId/role actually persisting, or a user joins the org without the invite ever being marked used (re-usable token)
AuthService.register() (invite path)	auth.service.ts:54 (consumeInviteForRegistration → invite usedAt write) → :60-63 (userService.create → new user row) → :66 (joinTeamAfterRegistration → team_members insert)	Worst case in the whole codebase: if the process crashes between L54 and L60, the invite is permanently burned (usedAt set) with no user ever created — the invitee is locked out with no recovery path and no account
UserService.setStatus()	user.service.ts:96 (userRepo.save(target)) → :97 (incrementSessionVersion)	Status change could persist without the corresponding token invalidation, leaving a suspended user's still-live access token valid until natural expiry
RefreshTokenService.rotate()	refresh-token.service.ts:172 (repo.update — stamp old row rotatedAt) → :175 (this.store(...) — insert new row)	Crash between: old token marked rotated with no replacement row stored → user is effectively logged out (not silently exploitable, but an inconsistent half-rotated state)
RefreshTokenService.rotate() grace-window path	refresh-token.service.ts:155 (repo.update on active.id) → :158 (this.store(...))	Same risk as above, in the "duplicate presentation within grace window" branch
SessionsService.create()	sessions.service.ts:55 (sessionRepository.save(session)) → :58 (this.join(...) → participantRepository.save, sessions.service.ts:105) → conditionally :61-62 (startCompositeRecording, startPoseWorkersForActiveParticipants)	Crash after L55 leaves a sessions row with no coach session_participants row — the session exists but its creator isn't a participant
ClipsService.shareClip()	clips.service.ts:333 (clipShareRepository.remove(toDelete)) → :347 (clipShareRepository.save(newShares))	Crash between: some shares removed, new ones never added — student access to a clip could be silently revoked without the replacement grants being applied
8. Query Performance — N+1 Risk
Grepped every for (const/for (let/.map(async/.forEach(async across apps/api/src (non-spec) and manually inspected each for a repository/DB call inside the loop body:

clips.service.ts:178 (for (const s of allShares)) — no DB call inside; just aggregating an already-fetched array into a Map. Not N+1 — in fact the surrounding code (clips.service.ts:172-181) explicitly batches all clip-share counts in one query with the comment "Batch share counts for the coach's share button (avoids N queries)" — a deliberate anti-N+1 pattern.
clips.service.ts:189 (.map(async (c) => …), wrapped in Promise.all at L186-192) — calls this.referenceStorage.getPlaybackUrl(c.s3Key) per clip. This is an S3 presigned-URL generation per item (not a DB query), run in parallel via Promise.all, not sequential. Not a DB N+1, though it is N parallel outbound calls to S3.
egress-webhook.controller.ts:178 (for (const t of participant.tracks)) — iterates an in-memory webhook payload array (participant.tracks) looking for an audio track SID; no DB/repo call inside. Not N+1.
egress.service.ts:231 (for (const egress of activeEgresses)) — iterates a LiveKit API response list, calling this.stopEgress(egress.egressId) (a LiveKit RPC, not a DB call) per item, sequentially awaited. Not a DB N+1, but is a sequential (non-batched) external-API loop.
pose-relay.service.ts:92,94 (nested for loops) — no repository calls inside (Redis/pose-worker message relay); not N+1.
realtime.gateway.ts:170,324,332,339,449 (for (const studentId of studentIds)) — all are client.to(...).emit(...) Socket.IO fan-out calls, no DB access inside any of them. Not N+1.
reference.service.ts:366 (for (const [frameIndexStr, strokes] of Object.entries(...))) and the nested :371 (for (const stroke of strokes)) — both just push into an in-memory annotations: Annotation[] array (reference.service.ts:374-384); the actual DB write is a single batched this.annotationRepo.save(annotations) at :388 after both loops complete. Not N+1 — another deliberate batch-then-save pattern.
Conclusion: no N+1 query pattern (a .findOne()/query executed once per loop iteration) was found anywhere in apps/api/src. Every loop that touches the DB does so via a single batched query before or after the loop, not inside it. This is a genuinely clean area of the codebase.

9. Docker / Docker Compose
apps/api/Dockerfile — exists (apps/api/Dockerfile, read in full). Two-stage build: node:20-alpine builder (pnpm install, builds @replaycoach/types then @replaycoach/api), then a slim node:20-alpine runner that copies dist/ + prod node_modules, exposes port 3001, CMD ["node", "dist/main"].
apps/web/Dockerfile — exists (apps/web/Dockerfile, read in full). Same two-stage pattern, builds Next.js with standalone output, exposes port 3000, CMD ["node", "apps/web/server.js"].
apps/pose-service/Dockerfile — confirmed absent. No Dockerfile anywhere under apps/pose-service.
docker-compose.yml — exists at repo root (docker-compose.yml, read in full). Defines only 3 dev-support services: postgres:15-alpine, redis:7-alpine, livekit/livekit-server:latest (dev mode with hardcoded devkey:secret). It does NOT define api, web, or pose-service as services — the two Dockerfiles that exist are not referenced anywhere in this compose file (no build: blocks pointing at them). This is a dev-dependencies-only compose file, not a full-stack deployment compose file.
10. Nginx / Reverse Proxy / SSL / Terraform
Nginx: confirmed absent — no .conf files, no nginx* files/directories anywhere in the repo (searched excluding node_modules/venv).

infra/ directory contents (full list, 19 files):

infra/SCALING.md
infra/terraform/main.tf
infra/terraform/variables.tf
infra/terraform/outputs.tf
infra/terraform/modules/ecs/{main,variables,outputs}.tf
infra/terraform/modules/rds/{main,variables,outputs}.tf
infra/terraform/modules/elasticache/{main,variables,outputs}.tf
infra/terraform/modules/s3/{main,variables,outputs}.tf
infra/terraform/modules/cloudfront/{main,variables,outputs}.tf
Terraform actual state: infra/terraform/main.tf (read in full) only actively calls one module — module "s3" (L53-57). The ecs, rds, elasticache, and cloudfront module blocks are all commented out (L35-63, "wired up in later phases"). The rds/main.tf, ecs/main.tf, and elasticache/main.tf files are each literally just a 2-line placeholder comment (# RDS PostgreSQL module — placeholder for primary + read-replica / # Implementation: infra phase) with zero actual resource blocks. cloudfront/main.tf is the same — placeholder comment only, no resources. No ALB, no ACM/SSL certificate resource, no ECS service, no RDS instance exists anywhere in this Terraform. The remote state S3 backend is also commented out (main.tf:11-19).

The only real infra actually defined in Terraform: infra/terraform/modules/s3/main.tf (read in full) — creates one bucket, aws_s3_bucket.raw_recordings (replaycoach-${environment}-recordings-raw), with a KMS key + SSE-KMS encryption, public-access block, a TLS-only bucket policy, and an IAM role/policy scoped for LiveKit egress s3:PutObject/PutObjectAcl. No S3 lifecycle/expiration rule resource exists in this file. The module's own header comment (s3/main.tf:1, "S3 module — recordings bucket + clips/exports bucket") describes intent for a second "clips/exports" bucket that was never actually implemented — only raw_recordings exists as a real resource.

infra/SCALING.md — full content summary (read in full, 53 lines)
Documents 4 operational topics for running >1 instance of the API/pose-service, not infrastructure-as-code, purely narrative ops notes:

Load balancer / sticky sessions: Socket.IO's polling transport fallback needs LB stickiness (cookie or IP-hash) unless the ingress reliably supports end-to-end WebSocket upgrades. Cross-instance broadcast fan-out is handled separately by a Redis Socket.IO adapter (apps/api/src/realtime/redis-io.adapter.ts).
Postgres connection pool: notes that apps/api/.env's DATABASE_URL currently points at the Supabase session pooler (port 5432) — recommends switching to Supabase's transaction pooler (port 6543) for multi-instance deployments, but flags that migrations must still run against a direct/session connection since some DDL doesn't work through the transaction pooler. References extra.max (app.module.ts:66, currently 20) as the per-instance pool size and warns to keep max × instance_count under Supabase's plan connection limit.
Pose-service capacity: each replica caps at max_workers (config.py, default 8) concurrent tracks; a Redis command queue (pose:commands, consumer group pose-workers) load-balances start/stop commands across replicas.
LiveKit/egress capacity: flagged as out of app scope — notes a single dev LiveKit server doesn't scale, recommends LiveKit Cloud or a clustered SFU for production, and that egress worker count must be sized to concurrent recorded sessions.
This confirms (via SCALING.md itself) that the actual production database is Supabase-managed Postgres, not the Terraform rds module (which is an empty placeholder) — i.e., the real DB backend is not represented in this repo's IaC at all.

11. AWS Deployment / PM2
No ecosystem.config.js anywhere in the repo (glob search for **/ecosystem*.js returned nothing; a follow-up content grep for pm2|ecosystem across the whole repo, excluding node_modules/venv, returned zero matches in any file).
No deployment shell scripts — a repo-wide search for *.sh files (excluding node_modules/venv) returned zero results. No deploy.sh or any other shell script exists in this repo.
.github/workflows/ contains exactly 2 files:
ci.yml (read in full) — runs on every PR: pnpm install, Turborepo cache, pnpm turbo build --filter=@replaycoach/types, pnpm turbo lint, pnpm turbo typecheck. No test step, no Docker build, no deploy step.
deploy-staging.yml (read in full) — triggers on push to main. Its only step is literally:

- name: Placeholder — deploy not yet implemented
  run: echo "Staging deploy not yet implemented. Wire up in infra phase."
with a comment block describing the intended future steps (build Docker images → push to ECR → update ECS service → run migrations → smoke test) that have not been implemented. This workflow is a documented no-op.
Conclusion: PM2 process management (fitness-api, fitness-web, fitness-ml) and the SSH+git-pull+build+restart workflow described in your prompt are not represented anywhere in this repository — no committed ecosystem config, no committed deploy script, no working CI/CD deploy job. That workflow, if it's the actual production deployment method, is entirely undocumented/ad hoc from this repo's point of view.
12. Monitoring / Logging Infrastructure
Searched for logrotate|datadog|grafana|prometheus|cloudwatch|sentry (case-insensitive) across .md/.ts/.tf/.yml/.json repo-wide (excluding node_modules/venv): zero matches. No infra-level log shipping config, no log rotation config, no monitoring/dashboard config of any kind exists in this repo. (Application-level logging itself — NestJS Logger usage — is out of scope per your note and was not further investigated here.)

13. Backups / Disaster Recovery
Searched for pg_dump|backup|BACKUP across .md/.ts/.tf/.yml repo-wide (excluding node_modules/venv): zero matches. No pg_dump cron, no RDS automated-backup Terraform resource (moot anyway since the rds module is an empty placeholder — see §10), no S3 lifecycle policy for any bucket (confirmed no aws_s3_bucket_lifecycle_configuration resource exists in infra/terraform/modules/s3/main.tf). No backup or disaster-recovery mechanism of any kind — documented, scripted, or IaC-defined — exists anywhere in this repository. (Whether Supabase's own managed automated backups cover the actual production DB, per infra/SCALING.md's mention of the Supabase pooler, is not something this repo documents or configures.)

14. S3 Usage Specifics
Grepped BUCKET/bucket/S3 SDK usage across apps/api/src and apps/pose-service (excluding venv):

S3_RAW_RECORDINGS_BUCKET — apps/api/src/media/egress.service.ts:32: this.bucketName = this.configService.get<string>('S3_RAW_RECORDINGS_BUCKET') ?? \replaycoach-${environment}-recordings-raw`. Purpose: LiveKit egress writes raw session recordings here (matches the one real Terraform-defined bucket, raw_recordings`, in §10).
S3_REFERENCE_VIDEOS_BUCKET — apps/api/src/reference/reference-storage.service.ts:46: used by ReferenceStorageService for coach-uploaded reference/analysis videos. Purpose: reference video storage + playback (presigned GET URLs, reference-storage.service.ts:134-145). This bucket is not defined anywhere in the Terraform (only raw_recordings exists as a resource) — it's referenced only via env var/config, with a documented local-disk dev fallback (reference-storage.service.ts:14-22) when the env var is unset.
No separate "clips" bucket, no "exports" bucket env var found — clips (Clip.s3Key) appear to reuse whichever storage backend produced them (HLS manifests from the recordings pipeline for clipType: 'recording', or the ReferenceStorageService/S3_REFERENCE_VIDEOS_BUCKET backend for clipType: 'reference', per the doc comment at others.entities.ts:136-140) — there is no distinct third bucket.
apps/api/.env.example (read in full) has only commented-out placeholders: # AWS_S3_BUCKET_RECORDINGS= and # AWS_S3_BUCKET_CLIPS= under a # AWS S3 (not used yet, placeholder for Phase 2) header — confirming these two are aspirational/unused, and # S3_REFERENCE_VIDEOS_BUCKET=replaycoach-reference-videos is the one actually-wired-up variable.
pose-service: no BUCKET/S3/boto3 references found in apps/pose-service source (excluding venv) — the pose-service does not talk to S3 directly; it receives/returns media via HTTP callbacks to/from the API (per reference-storage.service.ts's doc comment about signed URLs for the pose-service round-trip).
S3 lifecycle/expiration policy: confirmed absent — no aws_s3_bucket_lifecycle_configuration in Terraform, no lifecycle/expiration logic referenced in any API or pose-service code, no mention in any .md doc.
15. Temporary File Cleanup (apps/api)
Multer uploads: apps/api/src/reference/reference.controller.ts uses @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } })) at 3 call sites (reference.controller.ts:53, :235, :254), consumed via @UploadedFile() file: Express.Multer.File. No storage: option is configured in any of the 3 FileInterceptor(...) calls — this means Multer defaults to MemoryStorage (buffer held in file.buffer, never written to local disk by Multer itself). Confirmed: multer uploads are memory-buffer-only, no multer disk-storage temp files.
However, apps/api does write persistent (not strictly "temp") files to local disk in one place: ReferenceStorageService (reference-storage.service.ts:38, :85-95, :110-121) — when S3_REFERENCE_VIDEOS_BUCKET is not configured, it falls back to writing reference-video buffers under apps/api/uploads/reference-videos/ (path.join(process.cwd(), 'uploads', 'reference-videos')) via fs.writeFile (saveBuffer(), L92-94), and later serves them back via createReadStream (L119-121). This is a deliberate dev-only persistent storage fallback, not a transient temp file — but there is no cleanup/eviction logic for it anywhere (no TTL, no cron, no size cap) — files written here accumulate indefinitely on local disk in dev mode.
No other tmp/tempfile/os.tmpdir()-style usage was found anywhere in apps/api/src (excluding specs).
16. Deployment Scripts
Confirmed via §11: there is no automated build+deploy sequence anywhere in this repo.

Root package.json (read in full) scripts: build (turbo build), dev (turbo dev), lint, typecheck, format, format:check — no deploy script, no start/pm2 script.
No shell scripts of any kind exist in the repo (find … -iname "*.sh" → empty).
.github/workflows/deploy-staging.yml is a documented no-op placeholder (§11).
Conclusion: per this repo's own contents, the build+deploy sequence is entirely manual — there is nothing committed that automates it. This matches (and confirms, from the repo side) the "typed-by-hand SSH commands" workflow described in your prompt.
You've hit your session limit · resets 2:20pm (Asia/Karachi)

