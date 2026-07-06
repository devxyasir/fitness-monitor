import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, timingSafeEqual } from 'crypto';
import { promises as fs, createReadStream } from 'fs';
import type { ReadStream } from 'fs';
import * as path from 'path';

/**
 * Stores reference-video media (source video + keypoints JSON).
 *
 * Two modes, selected automatically:
 *  - S3 (production/AWS): when S3_REFERENCE_VIDEOS_BUCKET is configured,
 *    objects are stored in S3 and played back via short-lived presigned
 *    GET URLs — mirrors the pattern EgressService already uses for LiveKit
 *    egress uploads.
 *  - Local disk (dev fallback): when no bucket is configured, objects are
 *    written under apps/api/uploads/ and served via the HMAC-signed media
 *    route on ReferenceMediaController (mirrors CloudFrontSigner's mock
 *    mode). <video> tags and the pose-service can't send an Authorization
 *    header, hence signed URLs rather than JWT auth for both modes.
 *
 * Callers only depend on save/read/getPlaybackUrl — never on which mode is
 * active.
 */
@Injectable()
export class ReferenceStorageService {
  private readonly logger = new Logger(ReferenceStorageService.name);
  private readonly localRoot: string;
  private readonly publicBaseUrl: string;
  private readonly signingSecret: string;

  private readonly s3Client: S3Client | null;
  private readonly bucket: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.localRoot = path.join(process.cwd(), 'uploads', 'reference-videos');
    const port = this.configService.get<string>('app.port', '3001');
    // In a real (non-same-machine) deployment, localhost is wrong for any
    // URL handed to another process (the browser, or the pose-service) —
    // API_PUBLIC_URL overrides it; local dev is unaffected by default.
    this.publicBaseUrl = this.configService.get<string>('API_PUBLIC_URL') || `http://localhost:${port}`;
    this.signingSecret = this.configService.getOrThrow<string>('jwt.secret');

    this.bucket = this.configService.get<string>('S3_REFERENCE_VIDEOS_BUCKET');
    const region = this.configService.get<string>('AWS_REGION') ?? 'us-east-1';

    if (this.bucket) {
      this.s3Client = new S3Client({ region });
      this.logger.log(`Reference videos: S3 mode — bucket "${this.bucket}" (${region}).`);
    } else {
      this.s3Client = null;
      this.logger.warn(
        'S3_REFERENCE_VIDEOS_BUCKET not configured — reference videos are stored on local disk (dev-only fallback).',
      );
    }
  }

  get isS3Enabled(): boolean {
    return this.s3Client !== null;
  }

  /** The API's own public base URL — reused by ReferenceService for the pose-service callback URL. */
  get apiPublicBaseUrl(): string {
    return this.publicBaseUrl;
  }

  private resolvePath(key: string): string {
    const resolved = path.resolve(this.localRoot, key);
    if (!resolved.startsWith(path.resolve(this.localRoot))) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return resolved;
  }

  private contentTypeFor(key: string): string {
    if (key.endsWith('.json')) return 'application/json';
    if (key.endsWith('.webm')) return 'video/webm';
    if (key.endsWith('.mov')) return 'video/quicktime';
    if (key.endsWith('.mkv')) return 'video/x-matroska';
    return 'video/mp4';
  }

  async saveBuffer(key: string, data: Buffer): Promise<void> {
    if (this.s3Client && this.bucket) {
      await this.s3Client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: this.contentTypeFor(key) }),
      );
      return;
    }
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async saveJson(key: string, data: unknown): Promise<void> {
    await this.saveBuffer(key, Buffer.from(JSON.stringify(data)));
  }

  async stat(key: string): Promise<{ size: number } | null> {
    if (this.s3Client && this.bucket) {
      try {
        const res = await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
        return { size: res.ContentLength ?? 0 };
      } catch {
        return null;
      }
    }
    try {
      const s = await fs.stat(this.resolvePath(key));
      return { size: s.size };
    } catch {
      return null;
    }
  }

  /** Local-mode only — the S3 mode never routes media through our own API. */
  createReadStreamForKey(key: string, options?: { start: number; end: number }): ReadStream {
    return createReadStream(this.resolvePath(key), options);
  }

  // ── Signed playback URLs ─────────────────────────────────────────────────

  private hmac(key: string, exp: number): string {
    return createHmac('sha256', this.signingSecret).update(`${key}:${exp}`).digest('hex');
  }

  /**
   * Public URL a client (or the pose-service) can fetch the stored object
   * from. If `key` is already an absolute URL (a coach-pasted external video
   * URL, used directly rather than re-hosted), it is returned unchanged.
   */
  async getPlaybackUrl(key: string, ttlSeconds = 6 * 60 * 60): Promise<string> {
    if (/^https?:\/\//i.test(key)) return key;

    if (this.s3Client && this.bucket) {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      return getSignedUrl(this.s3Client, command, { expiresIn: ttlSeconds });
    }

    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = this.hmac(key, exp);
    return `${this.publicBaseUrl}/api/v1/reference/media/${encodeURI(key)}?exp=${exp}&sig=${sig}`;
  }

  verifySignature(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = this.hmac(key, exp);
    if (sig.length !== expected.length) return false;
    try {
      return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  /** Stateless callback token so only the pose-service round-trip can complete a video. */
  callbackToken(refId: string): string {
    return createHmac('sha256', this.signingSecret).update(`reference-complete:${refId}`).digest('hex');
  }

  verifyCallbackToken(refId: string, token: string): boolean {
    const expected = this.callbackToken(refId);
    if (token.length !== expected.length) return false;
    try {
      return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }
}
