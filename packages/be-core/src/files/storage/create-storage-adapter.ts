import { RequestHandler } from 'express';
import { StorageAdapter } from './storage-adapter';
import { S3StorageAdapter, S3StorageConfig } from './s3-storage-adapter';

export interface StorageConfig {
  /** S3-compatible bucket (Cloudflare R2, AWS S3, MinIO, Backblaze B2, …). */
  s3: S3StorageConfig;
  /**
   * Middleware guarding `POST` and `DELETE` on the file service router (typically
   * `[createExtractUser(jwtSecret)]`). `GET` stays public.
   */
  writeMiddleware?: RequestHandler[];
  /**
   * When a public file has a CDN URL, serve `GET /api/files/:id` as a 302 redirect to it
   * instead of proxy-streaming the bytes. Default `true`.
   */
  preferRedirect?: boolean;
  /** Max upload size in bytes. Default 25 MiB. */
  maxFileSize?: number;
  /** Mount path for the file service router. Default `/api/files`. */
  routePath?: string;
}

export function createStorageAdapter(config: StorageConfig): StorageAdapter {
  return new S3StorageAdapter(config.s3);
}
