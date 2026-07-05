import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'crypto';

@Injectable()
export class CloudFrontSigner {
  private readonly logger = new Logger(CloudFrontSigner.name);
  private readonly domain: string | undefined;
  private readonly keyPairId: string | undefined;
  private readonly privateKey: string | undefined;
  private readonly isMockEnabled: boolean = false;

  constructor(private readonly configService: ConfigService) {
    this.domain = this.configService.get<string>('cloudfront.domain');
    this.keyPairId = this.configService.get<string>('cloudfront.keyPairId');
    this.privateKey = this.configService.get<string>('cloudfront.privateKey');

    if (!this.domain || !this.keyPairId || !this.privateKey) {
      this.logger.warn(
        'CloudFront environment variables missing. CloudFront signer will fallback to mock mode.',
      );
      this.isMockEnabled = true;
    }
  }

  /**
   * Signs a CloudFront relative path index URL with a tight expiration TTL.
   * If configuration values are missing, it falls back to raw URL suffixing a mock validation parameter.
   */
  signUrl(relativePath: string, ttlSeconds: number = 900): string {
    const cleanPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    const cdnDomain = this.domain || 'cdn.localhost';
    const baseUrl = `https://${cdnDomain}/${cleanPath}`;

    const expiresEpoch = Math.floor(Date.now() / 1000) + ttlSeconds;

    if (this.isMockEnabled || !this.keyPairId || !this.privateKey) {
      return `${baseUrl}?Expires=${expiresEpoch}&Signature=mock_sig_dev_only&Key-Pair-Id=mock-keypair`;
    }

    try {
      // 1. Construct canned policy statement
      const policy = JSON.stringify({
        Statement: [
          {
            Resource: baseUrl,
            Condition: {
              DateLessThan: {
                'AWS:EpochTime': expiresEpoch,
              },
            },
          },
        ],
      });

      // 2. Sign custom policy with private key using RSA-SHA1
      const signObject = createSign('RSA-SHA1');
      signObject.update(policy);
      const signatureBuffer = signObject.sign(this.privateKey);

      // 3. Format to URL-safe Base64 as required by CloudFront specs
      const signatureBase64 = signatureBuffer.toString('base64');
      const cleanSignature = signatureBase64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '~');

      return `${baseUrl}?Expires=${expiresEpoch}&Signature=${cleanSignature}&Key-Pair-Id=${this.keyPairId}`;
    } catch (err: any) {
      this.logger.error(`Error generating CloudFront signature: ${err.message ?? err}`);
      return `${baseUrl}?Expires=${expiresEpoch}&Signature=error_signature_fallback&Key-Pair-Id=mock-fallback`;
    }
  }
}
