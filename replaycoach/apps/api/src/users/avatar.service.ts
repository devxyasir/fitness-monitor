import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB — generous for a phone photo, sharp does the real compression
const OUTPUT_SIZE = 512; // square, plenty for every avatar size actually rendered in the UI

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);
  private readonly root: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.root = path.join(process.cwd(), 'uploads', 'avatars');
    const port = this.configService.get<string>('app.port', '3001');
    this.publicBaseUrl = this.configService.get<string>('API_PUBLIC_URL') || `http://localhost:${port}`;
  }

  /** Resizes to a fixed square, converts to webp (small + broadly supported),
   * strips EXIF (privacy — a phone photo's EXIF can carry GPS coordinates). */
  async processAndSave(userId: string, file: { buffer: Buffer; size: number; mimetype: string }): Promise<string> {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Image must be under 8MB.');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image.');
    }

    let compressed: Buffer;
    try {
      compressed = await sharp(file.buffer)
        .rotate() // apply EXIF orientation before stripping it
        .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (err) {
      this.logger.warn(`Failed to process avatar upload for user ${userId}`, err instanceof Error ? err.stack : err);
      throw new BadRequestException('Could not process this image — try a different file.');
    }

    await fs.mkdir(this.root, { recursive: true });
    const filename = `${userId}-${randomUUID()}.webp`;
    await fs.writeFile(path.join(this.root, filename), compressed);

    return `${this.publicBaseUrl}/api/v1/avatars/${filename}`;
  }

  /** Best-effort cleanup when a user replaces or clears an uploaded avatar —
   * only touches files this service itself wrote (URL must point at our own
   * /api/v1/avatars/ path), never a pasted external URL. */
  async deleteIfOwned(avatarUrl: string | null): Promise<void> {
    if (!avatarUrl?.includes('/api/v1/avatars/')) return;
    const filename = avatarUrl.split('/api/v1/avatars/').pop();
    if (!filename) return;
    try {
      await fs.unlink(path.join(this.root, filename));
    } catch {
      // Already gone, or never existed locally (e.g. this ran on a
      // different app instance) — not worth failing the request over.
    }
  }
}
