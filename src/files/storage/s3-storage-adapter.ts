import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageAdapter, StorageByteRange, StoragePutOptions } from './storage-adapter';

export interface S3StorageConfig {
  /** Bucket endpoint, e.g. `https://<accountid>.r2.cloudflarestorage.com` for Cloudflare R2. */
  endpoint: string;
  /** Region. R2 ignores it — leave unset to default to `'auto'`. */
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Base URL objects are publicly served from (an R2 custom domain, or the `*.r2.dev` URL).
   * When set, public files are served by 302-redirecting to `${publicBaseUrl}/${key}` and the
   * API never proxies their bytes. Leave unset to always proxy-stream through the API.
   */
  publicBaseUrl?: string;
  /** Use path-style URLs (`endpoint/bucket/key`) instead of virtual-hosted-style. */
  forcePathStyle?: boolean;
  /** Presigned-URL TTL in seconds for private files. Default 3600. */
  signedUrlTtlSeconds?: number;
}

const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl?: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(config: S3StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region ?? 'auto',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? false,
    });
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl?.replace(/\/+$/, '');
    this.signedUrlTtlSeconds = config.signedUrlTtlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  }

  async put(key: string, body: Buffer | Readable, options: StoragePutOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        ContentLength: options.contentLength,
      })
    );
  }

  async getStream(key: string, range?: StorageByteRange): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      })
    );
    return response.Body as Readable;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  getPublicUrl(key: string): string | undefined {
    if (!this.publicBaseUrl) return undefined;
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${this.publicBaseUrl}/${encodedKey}`;
  }

  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds ?? this.signedUrlTtlSeconds,
    });
  }
}
